const { withBrowser } = require('D:/開排球場/volleycourt/tools/shoot-creator-bg.cjs');
withBrowser(async ({send,evaluate,waitFor,origin}) => {
 await send('Page.navigate',{url:origin+'/gym.html?site=bs-shenjing&practice=1&debug'});
 await waitFor('!!window.__gym');
 await new Promise(r=>setTimeout(r,5000));
 console.log(await evaluate('({walk:__gym.walk, avatars:window.__avs?.length})'));
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'p',code:'KeyP',windowsVirtualKeyCode:80});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'p',code:'KeyP',windowsVirtualKeyCode:80});
 await new Promise(r=>setTimeout(r,1000));
 console.log(await evaluate('({avs:(window.__avs||[]).map(a=>({keys:Object.keys(a),visible:a.g.visible,pos:a.g.position})),walk:__gym.walk.on})'));
}).catch(e=>{console.error(e);process.exitCode=1});
