// ---------------------------------------------------------------- catalog
// w = size along x, d = size along z (metres), h = height. zoneOK: may stand in a court's free zone.
const CAT = {
  vb: { label: '排球場（標準規格）', group: '球場', w: 25, d: 18, court: 'vb', play: [18, 9], color: '#4E9468', tag: true },
  vbs: { label: '排球場（精簡）', group: '球場', w: 24, d: 15, court: 'vb', play: [18, 9], color: '#4E9468', tag: true },
  vbt: { label: '排球場（並排、兩側不留緩衝）', group: '球場', w: 25, d: 9, court: 'vb', play: [18, 9], color: '#4E9468', tag: true },
  bd: { label: '羽球場', group: '球場', w: 17.4, d: 8.1, court: 'bd', play: [13.4, 6.1], color: '#3C8A63', tag: true },
  pb: { label: '匹克球場', group: '球場', w: 18.3, d: 9.1, court: 'pb', play: [13.41, 6.1], color: '#2F6F86', tag: true },
  bk: { label: '籃球 3 對 3 半場', group: '球場', w: 17, d: 13, court: 'bk', play: [15, 11], color: '#B5763E', tag: true },
  bench: { label: '長椅', group: '休息與服務', w: 2, d: 0.45, h: 0.45, color: '#B98A57' },
  sofa: { label: '沙發', group: '休息與服務', w: 2.2, d: 0.9, h: 0.85, color: '#3E4A5E' },
  table: { label: '桌椅組', group: '休息與服務', w: 1.6, d: 1.6, h: 0.75, color: '#D8C3A0' },
  rug: { label: '休息區地墊', group: '休息與服務', w: 6, d: 4, h: 0.02, color: '#8A8F7A', resize: true, tag: true },
  counter: { label: '櫃台', group: '休息與服務', w: 3, d: 0.8, h: 1.1, color: '#2A2F3A', resize: true, tag: true },
  vending: { label: '販賣機', group: '休息與服務', w: 1, d: 0.8, h: 1.8, color: '#B8352E', tag: true },
  water: { label: '飲水機', group: '休息與服務', w: 0.5, d: 0.5, h: 1.15, color: '#D9E2EA' },
  locker: { label: '置物櫃', group: '休息與服務', w: 1.8, d: 0.5, h: 1.9, color: '#5E6B7A', resize: true, tag: true },
  plant: { label: '植栽', group: '休息與服務', w: 0.6, d: 0.6, h: 1.5, color: '#4F7A4A' },
  aed: { label: 'AED', group: '休息與服務', w: 0.45, d: 0.2, h: 0.5, color: '#2E9E5B', tag: true },
  foldtable: { label: '白色折疊桌', group: '休息與服務', w: 1.8, d: 0.75, h: 0.74, color: '#EDEFF0', resize: true },
  foldchair: { label: '折疊椅', group: '休息與服務', w: 0.46, d: 0.5, h: 0.82, color: '#ECEEF0' },
  campchair: { label: '木製露營椅', group: '休息與服務', w: 0.55, d: 0.62, h: 0.8, color: '#9C7A55' },
  camptable: { label: '木製露營小桌', group: '休息與服務', w: 0.6, d: 0.6, h: 0.6, color: '#9C7A55' },
  desk: { label: '辦公桌（電腦）', group: '休息與服務', w: 1.4, d: 0.7, h: 0.75, color: '#F2F2F0' },
  cubby: { label: '木格置物櫃', group: '休息與服務', w: 1.6, d: 0.35, h: 1.5, color: '#C89A62', resize: 'w', tag: true },
  shoerack: { label: '鞋架', group: '休息與服務', w: 0.6, d: 0.3, h: 1.0, color: '#1F2124' },
  fridge: { label: '小冰箱', group: '休息與服務', w: 0.55, d: 0.55, h: 1.3, color: '#E9ECEE', tag: true },
  standac: { label: '落地冷氣', group: '休息與服務', w: 0.55, d: 0.38, h: 1.8, color: '#F1F2F3' },
  floorfan: { label: '立扇', group: '休息與服務', w: 0.45, d: 0.45, h: 1.2, color: '#1F2124' },
  curtain: { label: '更衣簾', group: '休息與服務', w: 1.2, d: 1.0, h: 2.1, color: '#7A5A3E', tag: true },
  steelsink: { label: '不鏽鋼洗手台', group: '休息與服務', w: 0.6, d: 0.5, h: 0.9, color: '#C8CCD0', tag: true },
  purifier: { label: '淨水器', group: '休息與服務', w: 0.3, d: 0.4, h: 0.45, color: '#E9ECEE' },
  coffee: { label: '長茶几（矮桌）', group: '休息與服務', w: 1.2, d: 0.5, h: 0.42, color: '#B98A57', resize: 'w' },
  lowcubby: { label: '矮木格置物櫃', group: '休息與服務', w: 1.2, d: 0.35, h: 0.9, color: '#C89A62', resize: 'w', tag: true },
  shelf: { label: '置物鐵架', group: '休息與服務', w: 1.8, d: 0.45, h: 2.0, color: '#2A2F3A', resize: 'w' },
  toilet: { label: '馬桶', group: '休息與服務', w: 0.45, d: 0.7, h: 0.8, color: '#F6F6F3', zoneOK: true },
  stall: { label: '廁所隔間（含馬桶）', group: '休息與服務', w: 0.95, d: 1.5, h: 2.0, color: '#D9D4CB', resize: true, zoneOK: true },
  urinal: { label: '小便斗', group: '休息與服務', w: 0.45, d: 0.4, h: 1.4, color: '#F6F6F3', zoneOK: true },
  sinkrow: { label: '洗手台（含鏡子）', group: '休息與服務', w: 1.2, d: 0.55, h: 1.9, color: '#ECEAE5', resize: 'w', zoneOK: true },
  showerstall: { label: '淋浴間', group: '休息與服務', w: 1.0, d: 1.1, h: 2.1, color: '#D7E6EA', zoneOK: true },
  warmmat: { label: '暖身墊＋滾筒', group: '比賽設備', w: 0.6, d: 1.7, h: 0.15, color: '#22304A', zoneOK: true },
  ballbasket: { label: '可折疊球籃', group: '比賽設備', w: 0.62, d: 0.62, h: 0.8, color: '#22304A' },
  flipscore: { label: '翻分板（桌上型）', group: '比賽設備', w: 0.6, d: 0.35, h: 0.6, color: '#F4F4F2' },
  whiteboard: { label: '戰術白板（移動式）', group: '比賽設備', w: 1.3, d: 0.6, h: 1.85, color: '#F4F4F2', tag: true },
  packac: { label: '箱型冷氣（落地大台）', group: '空調', w: 1.2, d: 0.6, h: 1.9, color: '#E9ECEE', tag: true },
  watertall: { label: '飲水機（冰溫熱）', group: '休息與服務', w: 0.45, d: 0.45, h: 1.4, color: '#C8CCD0', tag: true },
  speaker: { label: '音響喇叭（腳架）', group: '牆面', w: 0.9, d: 0.9, h: 1.95, color: '#1F2124' },
  bins: { label: '分類回收桶', group: '休息與服務', w: 0.95, d: 0.36, h: 0.78, color: '#8E9399', tag: true },
  wallfan: { label: '工業壁扇', group: '空調', w: 0.6, d: 0.35, h: 0.6, mountY: 2.6, color: '#1F2124', wall: true, zoneOK: true },
  exhaust: { label: '排風扇（牆面）', group: '空調', w: 0.64, d: 0.12, h: 0.64, mountY: 4.5, color: '#B9BCC0', wall: true, zoneOK: true },
  tv: { label: '壁掛電視', group: '牆面', w: 1.24, d: 0.06, h: 0.72, mountY: 2.0, color: '#15181D', wall: true, zoneOK: true, tag: true },
  clock: { label: '掛鐘', group: '牆面', w: 0.35, d: 0.05, h: 0.35, mountY: 3.0, color: '#1F2124', wall: true, zoneOK: true },
  wc: { label: '廁所（舊版房間）', group: '空間', w: 5, d: 4.5, h: 2.6, color: '#C9D6DC', room: true, resize: true, tag: true },
  shower: { label: '淋浴間（舊版房間）', group: '空間', w: 3, d: 4, h: 2.6, color: '#C3D6D3', room: true, resize: true, tag: true },
  changing: { label: '更衣室（舊版房間）', group: '空間', w: 4, d: 4, h: 2.6, color: '#D3CBDC', room: true, resize: true, tag: true },
  office: { label: '辦公室（舊版房間）', group: '空間', w: 4, d: 3, h: 2.6, color: '#D9CBB0', room: true, resize: true, tag: true },
  referee: { label: '裁判台', group: '比賽設備', w: 0.8, d: 0.8, h: 2.2, color: '#E8E2D6', zoneOK: true },
  scoreboard: { label: '計分板', group: '比賽設備', w: 1.4, d: 0.5, h: 1.6, color: '#1F2933', zoneOK: true, tag: true },
  ballcart: { label: '球車', group: '比賽設備', w: 1, d: 0.6, h: 1, color: '#E0B33A' },
  bleacher: { label: '觀眾席', group: '比賽設備', w: 6, d: 2.4, h: 1.2, color: '#8D99A6', resize: true, tag: true },
  netwall: { label: '隔網', group: '比賽設備', w: 18, d: 0.1, h: 5, color: '#1F2933', resize: 'w', tag: true },
  banner: { label: '牆面布幕／海報', group: '牆面、消防與安全', w: 8, d: 0.04, h: 3.6, mountY: 0.4, color: '#E9E9E6', wall: true, zoneOK: true, resize: 'w' },
  aircon: { label: '冷氣（掛牆）', group: '牆面、消防與安全', w: 1.2, d: 0.32, h: 0.42, mountY: 2.8, color: '#F2F4F6', wall: true, zoneOK: true },
  extinguisher: { label: '滅火器', group: '牆面、消防與安全', w: 0.35, d: 0.3, h: 0.6, mountY: 0, color: '#D7262B', wall: true, zoneOK: true },
  emlight: { label: '緊急照明燈', group: '牆面、消防與安全', w: 0.4, d: 0.12, h: 0.15, mountY: 2.6, color: '#F4F4F2', wall: true, zoneOK: true },
  exitsign: { label: '避難方向指示燈', group: '牆面、消防與安全', w: 0.45, d: 0.06, h: 0.2, mountY: 2.3, color: '#1E9E4A', wall: true, zoneOK: true },
  smoke: { label: '偵煙器（天花板）', group: '牆面、消防與安全', w: 0.2, d: 0.2, h: 0.06, color: '#F4F4F2', ceiling: true },
  crashpad: { label: '防撞墊（牆面）', group: '牆面、消防與安全', w: 6, d: 0.06, h: 2, mountY: 0, color: '#1E2A44', wall: true, zoneOK: true, resize: 'w', tag: true },
  firstaid: { label: '急救箱', group: '牆面、消防與安全', w: 0.42, d: 0.16, h: 0.32, mountY: 1.4, color: '#F4F4F2', wall: true, zoneOK: true },
  cctv: { label: '監視器（安全）', group: '牆面、消防與安全', w: 0.25, d: 0.25, h: 0.15, mountY: 3.2, color: '#1F2933', wall: true, zoneOK: true },
  heater: { label: '熱水器', group: '牆面、消防與安全', w: 0.45, d: 0.45, h: 0.9, mountY: 1.2, color: '#E8ECEF', wall: true, zoneOK: true },
  panel: { label: '配電盤', group: '牆面、消防與安全', w: 0.8, d: 0.25, h: 1.2, mountY: 0.6, color: '#8A96A6', wall: true, zoneOK: true, tag: true },
  light: { label: 'LED 條燈', group: '天花板', w: 2.4, d: 0.2, h: 0.1, color: '#F4F1E6', ceiling: true },
  fan: { label: '大型吊扇', group: '天花板', w: 7.3, d: 7.3, h: 1.2, color: '#3A4654', ceiling: true, diam: true, tag: true },
  camera: { label: '網路攝影機（智慧球場，掛牆）', group: '天花板', w: 0.4, d: 0.4, h: 0.3, color: '#22303F', ceiling: true, tag: true },
};
// 「空間」（舊版房間物件）不再放在選單裡，改用平面圖畫區域；舊方案裡的房間照樣顯示
const GROUPS = ['球場與比賽', '座椅與休息', '櫃台與收納', '衛浴與更衣', '飲水與販賣', '空調與照明', '牆面與裝飾', '消防與安全', '智慧球場'];
const GROUP_OF = {
  '球場與比賽': ['vb', 'vbs', 'vbt', 'bd', 'pb', 'bk', 'referee', 'scoreboard', 'flipscore', 'whiteboard', 'ballcart', 'ballbasket', 'netwall', 'bleacher', 'warmmat'],
  '座椅與休息': ['sofa', 'bench', 'table', 'coffee', 'foldtable', 'foldchair', 'campchair', 'camptable', 'rug', 'plant'],
  '櫃台與收納': ['counter', 'desk', 'locker', 'cubby', 'lowcubby', 'shelf', 'shoerack', 'curtain', 'bins'],
  '衛浴與更衣': ['toilet', 'stall', 'urinal', 'sinkrow', 'showerstall'],
  '飲水與販賣': ['watertall', 'water', 'purifier', 'vending', 'fridge', 'steelsink'],
  '空調與照明': ['packac', 'standac', 'aircon', 'fan', 'floorfan', 'wallfan', 'exhaust', 'light'],
  '牆面與裝飾': ['banner', 'crashpad', 'tv', 'clock', 'speaker'],
  '消防與安全': ['aed', 'firstaid', 'extinguisher', 'emlight', 'exitsign', 'smoke', 'cctv', 'panel', 'heater'],
  '智慧球場': ['camera'],
};
for (const [g, list] of Object.entries(GROUP_OF)) for (const k of list) if (CAT[k]) CAT[k].group = g;

// ---------------------------------------------------------------- zones (平面圖上畫的區域)
// enclosed: 用玻璃隔間圍起來（frosted = 霧面，隱私空間）；floor: 地坪材質；en: 圖面英文名
const ZONES = {
  floor: { label: '整片地板', en: 'FLOOR', color: '#D9D2C4', floor: 'vinyl', layer: 0, desc: '先鋪整片地板，再在上面畫廁所、休息區；地板永遠墊在其他區域下面。' },
  rest: { label: '休息區', en: 'LOUNGE', color: '#E2CBA6', floor: 'wood', desc: '打完球坐下來喝水、等下一場的地方。木地板、沙發和置物櫃，看得到球場，朋友打球時可以在這裡加油。' },
  reception: { label: '接待櫃台', en: 'RECEPTION', color: '#DDD6CA', floor: 'terrazzo', desc: '進門第一站：報到、付款、借球、買飲料。櫃台面向入口，也看得到整個球場。' },
  locker: { label: '更衣淋浴', en: 'LOCKER & SHOWER', color: '#C9D6DA', floor: 'tile', enclosed: true, solid: true, desc: '實心隔間＋門（看不到裡面），裡面有淋浴間、更衣長椅和置物櫃。熱水器與排水要先確認廠房管線。' },
  wc: { label: '廁所', en: 'RESTROOM', color: '#CCD8DE', floor: 'tile', enclosed: true, solid: true, desc: '實心隔間＋門（看不到裡面）。小間的就是一間馬桶＋洗手台，大間的才有隔間。男女分開，靠外牆比較好接排水。數量以使用人數與建管規定為準。' },
  storage: { label: '器材室', en: 'STORAGE', color: '#C9C2B6', floor: 'epoxy', enclosed: true, desc: '球車、網柱、備用球網、清潔用品都收在這裡。門要夠寬，網柱推得進去。' },
  warmup: { label: '暖身區', en: 'WARM-UP', color: '#9FAAB4', floor: 'mat', desc: '上場前拉筋、跳繩、滾筒放鬆。鋪運動軟墊，不佔用球場的緩衝區。' },
  office: { label: '辦公室', en: 'OFFICE', color: '#D6C9B2', floor: 'wood', enclosed: true, desc: '店長與教練辦公、監視器主機、配電盤旁邊。透明玻璃，看得到場內狀況。' },
  spectator: { label: '觀眾區', en: 'SPECTATORS', color: '#D8D1C4', floor: 'wood', desc: '比賽或課程時家長、朋友坐著看球的位置，可以放活動看台。' },
  other: { label: '其他空間', en: 'OTHER', color: '#E0DACF', floor: 'concrete', desc: '還沒決定用途的空間。' },
};
const COURT_DESC = { vb: '排球場：比賽區 18×9 m，四周留 3 m 以上的緩衝區。燈與吊扇放在邊線外，發球、接高球才不會刺眼。', bd: '羽球場：13.4×6.1 m。打羽球時吊扇要關掉，不然球會飄。', pb: '匹克球場：13.41×6.1 m，網中間高 0.86 m。', bk: '籃球 3 對 3 半場：15×11 m。' };

// ---------------------------------------------------------------- templates
const T_PRO = () => ({
  name: '2 面專業排球（標準規格）', building: { L: 36, W: 30, H: 9 }, floor: 'pu', net: 'men',
  zones: [
    { type: 'wc', x: -16.5, z: 12.5, w: 3, d: 5, name: '男廁' },
    { type: 'wc', x: -13.5, z: 12.5, w: 3, d: 5, name: '女廁' },
    { type: 'locker', x: -8.5, z: 12.5, w: 7, d: 5 },
    { type: 'rest', x: 0, z: 12.5, w: 10, d: 5 },
    { type: 'reception', x: 8, z: 12.5, w: 6, d: 5 },
    { type: 'storage', x: 13, z: 12.5, w: 4, d: 5 },
    { type: 'warmup', x: 16.5, z: 12.5, w: 3, d: 5 },
  ],
  items: [
    { type: 'vb', x: -9, z: -2.5, rot: 90, locked: true, label: '1 號場' }, { type: 'vb', x: 9, z: -2.5, rot: 90, locked: true, label: '2 號場' },
    { type: 'referee', x: -15.2, z: -2.5, rot: 0 }, { type: 'referee', x: 15.2, z: -2.5, rot: 0 },
    { type: 'sofa', x: -2, z: 14.2, rot: 0 }, { type: 'sofa', x: 2, z: 14.2, rot: 0 },
    { type: 'table', x: 0, z: 12.4, rot: 0 },
    { type: 'vending', x: 4.2, z: 14.4, rot: 0 },
    { type: 'water', x: -4.4, z: 14.5, rot: 0 },
    { type: 'ballcart', x: 13, z: 13.5, rot: 0 },
    { type: 'aed', x: 10.6, z: 14.8, rot: 0 },
    ...[-15.5, -2.5, 2.5, 15.5].flatMap((x) => [-12, -6, 0, 6].map((z) => ({ type: 'light', x, z, rot: 90 }))),
    { type: 'fan', x: 0, z: -9, rot: 0, w: 5.5, d: 5.5 }, { type: 'fan', x: 0, z: 3, rot: 0, w: 5.5, d: 5.5 },
    { type: 'camera', x: -17.4, z: -2.5, rot: 0, label: '攝影機 A' }, { type: 'camera', x: 17.4, z: -2.5, rot: 180, label: '攝影機 B' },
    { type: 'crashpad', x: -9, z: -14.9, rot: 0, w: 16 }, { type: 'crashpad', x: 9, z: -14.9, rot: 0, w: 16 },
  ],
});
const T_MIX = () => ({
  name: '1 面排球＋3 面羽球', building: { L: 25, W: 24, H: 8 }, floor: 'pu', net: 'men',
  zones: [
    { type: 'wc', x: -10.5, z: 9, w: 4, d: 6 },
    { type: 'locker', x: -5.5, z: 9, w: 6, d: 6 },
    { type: 'rest', x: 1, z: 9, w: 7, d: 6 },
    { type: 'reception', x: 7, z: 9, w: 5, d: 6 },
    { type: 'storage', x: 11, z: 9, w: 3, d: 6 },
  ],
  items: [
    { type: 'vb', x: 0, z: -3, rot: 0, locked: true },
    { type: 'bd', x: -8.1, z: -3, rot: 90, mode: 'lines', locked: true }, { type: 'bd', x: 0, z: -3, rot: 90, mode: 'lines', locked: true }, { type: 'bd', x: 8.1, z: -3, rot: 90, mode: 'lines', locked: true },
    { type: 'sofa', x: 1, z: 11.2, rot: 0 },
    { type: 'vending', x: 3.8, z: 11.4, rot: 0 },
    { type: 'ballcart', x: 11, z: 10, rot: 0 },
    ...[-9, -3, 3, 9].flatMap((x) => [-9.5, 3.5].map((z) => ({ type: 'light', x, z, rot: 90 }))),
    { type: 'camera', x: -12, z: -3, rot: 0, label: '攝影機' },
  ],
});
const T_EMPTY = () => ({ name: '空廠房 300 坪', building: { L: 30, W: 33, H: 8 }, floor: 'pu', net: 'men', zones: [], items: [] });
const TEMPLATES = [
  { make: T_PRO, title: '2 面專業排球（標準規格）', sub: '36×30 m・約 327 坪・淨高 9 m・含休息區、更衣淋浴' },
  { make: T_MIX, title: '1 面排球＋3 面羽球', sub: '25×24 m・約 181 坪・淨高 8 m・羽球只畫線' },
  { make: T_EMPTY, title: '空廠房 300 坪', sub: '30×33 m・淨高 8 m・自己從頭畫' },
];

// ---------------------------------------------------------------- state
let state = null;           // { id, name, building, floor, net, zones: [{id,type,x,z,w,d,name?}], items: [{id,type,x,z,rot,w?,d?,mode?,label?}] }
let selectedId = null;      // 選取的物件（球場、3D 元件）；多選時是最後點的那個
const selSet = new Set();   // 多選：全部選到的物件（含 selectedId）
const isSel = (id) => !!selectedId && (id === selectedId || selSet.has(id));
function selItems() { if (!selectedId) return []; const ids = new Set([...selSet, selectedId]); return state.items.filter((i) => ids.has(i.id)); }
let clip = null, clipN = 0;   // Ctrl+C 複製的物件
let selZoneId = null;       // 選取的區域
window.gymCounts = () => { const c = {}; if (state) for (const i of state.items) c[i.type] = (c[i.type] || 0) + 1; return { counts: c, name: state ? state.name : '', building: state ? state.building : null }; };
let history = [];
let readOnly = false;
let showLabels = true;
let snapOn = true;
let uidCounter = 1;
const uid = () => 'i' + Date.now().toString(36) + (uidCounter++).toString(36);

function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
function num(v, d) { const n = Number(v); return Number.isFinite(n) ? n : d; }
function sanitizeZone(z) {
  if (!z || !ZONES[z.type]) return null;
  const o = { id: typeof z.id === 'string' ? z.id : uid(), type: z.type, x: num(z.x, 0), z: num(z.z, 0), w: clamp(num(z.w, 4), 0.5, 160), d: clamp(num(z.d, 4), 0.5, 160) };
  if (typeof z.name === 'string' && z.name.trim()) o.name = z.name.slice(0, 20);
  // 照現況調整：地坪材質、隔間做法（open 開放、glass、frost、solid 實牆組合屋、net 圍網）、bare = 不自動擺設施
  if (ZONE_FLOORS.includes(z.floor)) o.floor = z.floor;
  if (['open', 'glass', 'frost', 'solid', 'net'].includes(z.walls)) o.walls = z.walls;
  if (z.bare === true) o.bare = true;
  const r = ((num(z.rot, 0) % 360) + 360) % 360; if (r) o.rot = Math.round(r * 100) / 100;
  if (['n', 'e', 's', 'w'].includes(z.door)) o.door = z.door;
  if (z.type === 'wc' && ['stalls', 'open'].includes(z.wcl)) o.wcl = z.wcl;
  if (typeof z.desc === 'string' && z.desc.trim()) o.desc = z.desc.slice(0, 160);
  return o;
}
const ZONE_FLOORS = ['vinyl', 'wood', 'deck', 'pvc', 'tiles', 'hardwood', 'tile', 'terrazzo', 'epoxy', 'mat', 'concrete'];
const FLOOR_LABELS = { vinyl: '灰色木紋地板', wood: '木地板（休息區）', deck: '木棧板', pvc: 'PVC 地墊（灰）', tiles: '拼裝式地墊', hardwood: '實木運動地板（楓木）', tile: '磁磚', terrazzo: '磨石子', epoxy: '環氧樹脂', mat: '運動軟墊', concrete: '水泥粉光' };
function zoneWalls(z) { return z.walls || (ZONES[z.type].enclosed ? (ZONES[z.type].solid ? 'solid' : ZONES[z.type].frosted ? 'frost' : 'glass') : 'open'); }
function zoneFloor(z) { return z.floor || ZONES[z.type].floor; }
// 自由畫的牆：a、b 兩端（公尺），kind = solid 實心牆、glass 玻璃、half 半牆、net 圍網；h 高度
const WALL_KINDS = { solid: '實心牆', glass: '玻璃隔間', half: '半牆（1.1 m）', net: '圍網' };
// 自訂顏色：館內地板、球場內場、球場外圍、牆面、防撞墊（沒設就用配色組合的顏色）
const COLOR_KEYS = ['hall', 'court', 'free', 'wood', 'wall', 'roof', 'steel', 'pad'];
function scheme() {
  const sc = SCHEMES[state.floor] || SCHEMES.pu, c = state.colors || {};
  // 木地板顏色：木紋配色的球場內外場都換成這個木色（外圍稍微深一點）；再單獨設內場／外圍的話以那個為準
  const wood = c.wood && (sc.grain || sc.wood) ? { court: c.wood, free: sc.grain ? c.wood : shadeHex(c.wood, 0.9) } : {};
  return { ...sc, ...wood, ...(c.court ? { court: c.court } : {}), ...(c.free ? { free: c.free } : {}), ...(c.pad ? { pad: c.pad } : {}) };
}
function shadeHex(hex, f) { const c = new THREE.Color(hex); c.multiplyScalar(f); return '#' + c.getHexString(); }
const tintCache = new Map();
// 換色但保留貼圖紋路（浪板、木紋）：用「選的顏色 ÷ 貼圖平均色」去乘，換完看起來就是選的那個顏色，紋路還在
function tintedKeep(base, hex, meanHex) {
  if (!hex) return base;
  const k = 'keep' + base.uuid + hex;
  if (!tintCache.has(k)) {
    const m = base.clone(), want = new THREE.Color(hex), mean = new THREE.Color(meanHex);
    m.color.setRGB(clamp(want.r / Math.max(0.05, mean.r), 0.05, 2.2), clamp(want.g / Math.max(0.05, mean.g), 0.05, 2.2), clamp(want.b / Math.max(0.05, mean.b), 0.05, 2.2));
    m.metalness = Math.min(m.metalness || 0, 0.3); tintCache.set(k, m);
  }
  return tintCache.get(k);
}
function tinted(base, hex) {
  if (!hex) return base;
  const k = base.uuid + hex;
  // 自訂色：拿掉貼圖顏色、壓低金屬反光，不然深色牆會反射成一片亮白
  if (!tintCache.has(k)) { const m = base.clone(); m.map = null; m.color.set(hex); m.metalness = Math.min(m.metalness || 0, 0.08); m.envMapIntensity = m.userData.env = Math.min(base.userData.env ?? 0.3, 0.2); tintCache.set(k, m); }
  return tintCache.get(k);
}
function sanitizeWall(w) {
  if (!w || !Array.isArray(w.a) || !Array.isArray(w.b)) return null;
  const a = [num(w.a[0], 0), num(w.a[1], 0)], b = [num(w.b[0], 0), num(w.b[1], 0)];
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.2) return null;
  const kind = WALL_KINDS[w.kind] ? w.kind : 'solid';
  return { id: typeof w.id === 'string' ? w.id : uid(), a, b, kind, h: clamp(num(w.h, kind === 'half' ? 1.1 : 3), 0.5, 15), ...(/^#[0-9a-f]{6}$/i.test(String(w.color || '')) ? { color: w.color } : {}) };
}
function sanitize(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const b = s.building || {};
  const out = {
    id: typeof s.id === 'string' ? s.id : null,
    name: typeof s.name === 'string' && s.name.trim() ? s.name.slice(0, 40) : '未命名方案',
    building: { L: clamp(num(b.L, 30), 10, 160), W: clamp(num(b.W, 30), 10, 160), H: clamp(num(b.H, 8), 4, 15), ...(b.wall === 'plaster' ? { wall: 'plaster' } : {}), ...(Number.isFinite(b.north) && b.north ? { north: num(b.north, 0) } : {}), ...(Number.isFinite(b.entryW) ? { entryW: clamp(num(b.entryW, 3), 0.9, 12) } : {}), ...(Array.isArray(b.entry) && b.entry.length === 2 && b.entry.every(Number.isFinite) ? { entry: [num(b.entry[0], 0), num(b.entry[1], 0)] } : {}), ...(typeof polyOf === 'function' ? polyOf(b) : {}) },
    floor: SCHEMES[s.floor] ? s.floor : 'pu',
    colors: Object.fromEntries(Object.entries(s.colors && typeof s.colors === 'object' ? s.colors : {}).filter(([k, v]) => COLOR_KEYS.includes(k) && /^#[0-9a-f]{6}$/i.test(String(v)))),
    net: NETS[s.net] ? s.net : 'men',
    zones: (Array.isArray(s.zones) ? s.zones.slice(0, 80) : []).map(sanitizeZone).filter(Boolean),
    walls: (Array.isArray(s.walls) ? s.walls.slice(0, 200) : []).map(sanitizeWall).filter(Boolean),
    items: [],
  };
  for (const it of Array.isArray(s.items) ? s.items.slice(0, 400) : []) {
    if (!it || !CAT[it.type]) continue;
    const def = CAT[it.type];
    const o = { id: typeof it.id === 'string' ? it.id : uid(), type: it.type, x: num(it.x, 0), z: num(it.z, 0), rot: ((num(it.rot, 0) % 360) + 360) % 360 };
    if (def.resize || def.diam) { o.w = clamp(num(it.w, def.w), 0.3, 60); o.d = def.resize === 'w' ? def.d : clamp(num(it.d, def.d), 0.1, 60); if (def.diam) o.d = o.w; }
    if (def.court && it.mode === 'lines') o.mode = 'lines';
    if (['white', 'dark', 'poster', 'black', 'red', 'blue'].includes(it.tone)) o.tone = it.tone;
    if (typeof it.label === 'string' && it.label.trim()) o.label = it.label.slice(0, 20);
    if (it.locked === true) o.locked = true;
    if (def.court) {
      const ex = Array.isArray(it.extra) ? it.extra.filter((k) => ['vb', 'bd', 'pb', 'bk'].includes(k) && k !== def.court) : [];
      if (ex.length) o.extra = [...new Set(ex)];
      if (['vb', 'bd', 'pb', 'bk', 'none'].includes(it.use) && it.use !== def.court) o.use = it.use;
      if (COURT_SURF[it.surf] && it.surf) o.surf = it.surf;
      if (def.court === 'vb' && it.post && VB_POST[it.post]) o.post = it.post;
    }
    if (def.court && it.cc && typeof it.cc === 'object') { const cc = {}; for (const k of ['court', 'free']) if (/^#[0-9a-f]{6}$/i.test(String(it.cc[k] || ''))) cc[k] = it.cc[k]; if (Object.keys(cc).length) o.cc = cc; }
    if (typeof it.zone === 'string' && it.zone) o.zone = it.zone.slice(0, 40);
    out.items.push(o);
  }
  return out;
}
function designData(s = state) {
  return { name: s.name, building: { ...s.building }, floor: s.floor, colors: { ...(s.colors || {}) }, net: s.net, zones: s.zones.map((z) => ({ ...z })), walls: (s.walls || []).map((w) => ({ ...w })), items: s.items.map(({ id, ...rest }) => rest) };
}
function fromTemplate(make) { const t = make(); return sanitize({ ...t, id: null }); }
function sizeOf(it) { const d = CAT[it.type]; return { w: it.w ?? d.w, d: it.d ?? d.d }; }
function labelOf(it) { return it.label || CAT[it.type].label; }
function zoneName(z) { return z.name || ZONES[z.type].label; }
const fmt1 = (n) => (Math.round(n * 10) / 10).toLocaleString('zh-TW');

