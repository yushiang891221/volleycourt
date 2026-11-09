// 離線 CPU 驗證；不宣稱代替 Three.js/WebGL 視覺驗收。
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const source = read('avatar-toy.js');
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { Object.assign(this, { x, y, z }); return this; }
  copy(p) { return this.set(p.x, p.y, p.z); }
  sub(p) { return this.set(this.x - p.x, this.y - p.y, this.z - p.z); }
  applyAxisAngle(axis, a) { assert.equal(axis.z, 1); const c = Math.cos(a), s = Math.sin(a); return this.set(this.x * c - this.y * s, this.x * s + this.y * c, this.z); }
}
class Group {
  constructor() { this.position = new Vector3(); this.rotation = { z: 0 }; this.children = []; }
  add(child) { child.parent = this; this.children.push(child); }
}
const context = vm.createContext({ THREE: { Vector3, Group, Bone: Group,
  Float32BufferAttribute: class { constructor(array, size) { this.array = array; this.itemSize = size; } }
}, URL, AbortSignal, console: { warn() {} }, fetch: async () => { throw new Error('offline'); } });
const block = source.slice(source.indexOf('const AVATAR_ASSETS'), source.indexOf('// ---------- 頭髮：髮束'))
  .replaceAll('import.meta.url', "'https://example.invalid/avatar-toy.js'")
  .replaceAll('export ', '').replace('void preloadAvatars();', '');
vm.runInContext(block, context);
const run = code => vm.runInContext(code, context);
const near = (a, b) => assert(Math.abs(a - b) < 1e-6, `${a} != ${b}`);

for (let hair = 0; hair < 8; hair++) for (let top = 0; top < 4; top++)
  for (let pants = 0; pants < 2; pants++) for (let knee = 0; knee < 3; knee++) {
    context.L = { hair, top, pants, knee };
    for (let i = 0; i < 8; i++) assert.equal(run(`partVisible('hair_${i}', L)`), i === hair);
    for (let i = 0; i < 4; i++) for (const part of ['top', 'collar']) assert.equal(run(`partVisible('${part}_${i}', L)`), i === top);
    for (let i = 0; i < 2; i++) {
      assert.equal(run(`partVisible('pants_${i}', L)`), i === pants);
      assert.equal(run(`partVisible('knee_${i}', L)`), pants === 0 && knee === i);
    }
    assert.equal(run("partVisible('headband_3', L)"), hair === 3);
    for (const part of ['body', 'head', 'socks', 'shoeR', 'shoeL']) assert(run(`partVisible('${part}', L)`));
  }
console.log('PASS 192 appearance combinations: hair/top/collar/pants/knees/headband and fixed parts');

near(run('sphericalUV(0, 0, 1)[0]'), 0.25);
near(run('sphericalUV(0, 0, -1)[0]'), 0.75);
near(run('sphericalUV(0, 1, 0)[1]'), 1);
near(run('sphericalUV(0, -1, 0)[1]'), 0);
const seam = run('unwrapFaceTriangle([[0.99, 0.5], [0.01, 0.5], [0.02, 0.6]])');
near(seam[1][0], 1.01); near(seam[2][0], 1.02);
context.geometry = { index: true, toNonIndexed() { return { attributes: { position: {
  count: 3, getX: () => 2, getY: () => 3, getZ: () => 5
} }, setAttribute(name, a) { this.attributes[name] = a; } }; } };
const uv = run('projectHeadUV(geometry, new THREE.Vector3(2,3,4)).attributes.uv.array');
for (let i = 0; i < 6; i += 2) { near(uv[i], 0.25); near(uv[i + 1], 0.5); }
console.log('PASS spherical projection orientation, center offset and triangle seam unwrap');

function world(group) {
  if (!group.parent) return { ...group.position, angle: group.rotation.z };
  const p = world(group.parent), c = Math.cos(p.angle), s = Math.sin(p.angle);
  return { x: p.x + group.position.x * c - group.position.y * s,
    y: p.y + group.position.x * s + group.position.y * c, z: p.z + group.position.z,
    angle: p.angle + group.rotation.z };
}
for (const sex of [0, 1]) {
  context.meta = JSON.parse(read(`models/avatar_${sex}.json`));
  const rig = run('makeGLBRig(meta)');
  for (const name of context.meta.bones) {
    const bone = rig.bones[name.replaceAll('.', '')]; assert(bone, name);
    const expected = name === 'root' ? [0, 0, 0] : context.meta.joints[name][0];
    const p = world(bone); near(p.x, expected[0]); near(p.y, expected[2]); near(p.z, -expected[1]);
    near(bone.position.x, 0); near(bone.position.y, 0); near(bone.position.z, 0);
  }
  for (const [i, side] of ['R', 'L'].entries()) {
    for (const [bone, group] of [['thigh', 'legs'], ['shin', 'knees'], ['foot', 'feet'], ['upperarm', 'arms'], ['forearm', 'elbows'], ['hand', 'hands']])
      assert.equal(rig.bones[bone + side].parent, rig[group][i]);
    rig.arms[i].rotation.z = 0;
    near(world(rig.hands[i]).x, world(rig.arms[i]).x);
    assert(world(rig.hands[i]).y < world(rig.elbows[i]).y);
  }
  const buffer = fs.readFileSync(path.join(root, `models/avatar_${sex}.glb`));
  assert.equal(buffer.toString('ascii', 0, 4), 'glTF');
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)));
  const partNodes = gltf.nodes.filter(n => n.mesh !== undefined);
  assert.deepEqual(partNodes.map(n => n.name).sort(), [...context.meta.parts].sort());
  for (const skin of gltf.skins) for (const joint of skin.joints)
    assert(rig.bones[gltf.nodes[joint].name.replaceAll('.', '')], gltf.nodes[joint].name);
  let triangles = 0;
  const counts = partNodes.map(n => {
    const mesh = gltf.meshes[n.mesh];
    const count = mesh.primitives.reduce((sum, p) => {
      for (const attr of ['POSITION', 'JOINTS_0', 'WEIGHTS_0']) assert(p.attributes[attr] !== undefined);
      if (n.name.startsWith('hair_')) assert(p.attributes.COLOR_0 !== undefined);
      if (n.name.startsWith('top_')) assert(p.attributes.TEXCOORD_0 !== undefined);
      return sum + gltf.accessors[p.indices].count / 3;
    }, 0); triangles += count; return `${n.name}:${count}`;
  });
  console.log(`PASS sex=${sex}: metadata joints, A-pose/unpose, 16 exported bones and actual GLB attributes`);
  console.log(`MODEL sex=${sex} bytes=${buffer.length} triangles(all variants)=${triangles} ${counts.join(' ')}`);
}
for (const file of ['avatar-toy.js', 'creator.js', 'gym.html', 'toy-preview.html']) {
  const text = read(file), scripts = file.endsWith('.html') ? [...text.matchAll(/<script[^>]*type="module"[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]) : [text];
  for (const script of scripts) {
    const r = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: script, encoding: 'utf8' });
    assert.equal(r.status, 0, file + r.stderr);
  }
  if (file !== 'avatar-toy.js') assert(text.includes('await preloadAvatars()'), file);
}
(async () => {
  const requests = [];
  const missing = vm.createContext({ URL, AbortSignal, console: { warn() {} },
    GLTFLoader: class {},
    fetch: async url => {
      requests.push(url.pathname);
      return url.pathname.endsWith('.glb') ? { ok: false, status: 404 }
        : { ok: true, json: async () => JSON.parse(read(url.pathname.slice(1))) };
    }
  });
  vm.runInContext(block, missing);
  assert.equal(await vm.runInContext('preloadAvatars()', missing), false);
  assert(requests.includes('/models/avatar_0.glb')); assert(requests.includes('/models/avatar_1.glb'));
  assert.equal(vm.runInContext('AVATAR_ASSETS.length', missing), 0);
  const first = run('preloadAvatars()'); assert.equal(first, run('preloadAvatars()')); assert.equal(await first, false);
  assert.equal(run('AVATAR_ASSETS.length'), 0);
  // 外層選擇函式：尚未完成、全部失敗、單一性別成功。
  const wrapper = source.slice(source.indexOf('export function makeToyAvatar'), source.indexOf('function makeProceduralAvatar'));
  vm.runInContext(wrapper.replace('export ', ''), context);
  run('normLook = L => L; makeProceduralAvatar = () => "fallback"; makeGLBAvatar = () => "glb";');
  assert.equal(run('makeToyAvatar({sex:0})'), 'fallback');
  run('AVATAR_ASSETS[1] = {}');
  assert.equal(run('makeToyAvatar({sex:1})'), 'glb'); assert.equal(run('makeToyAvatar({sex:0})'), 'fallback');
  console.log('PASS syntax, preload entry points, GLB 404, single-flight failure and per-sex fallback routing');
})().catch(error => { console.error(error); process.exitCode = 1; });
