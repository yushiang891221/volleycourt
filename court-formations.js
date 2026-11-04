/* Coordinates: d = metres from net; L = left when facing the net.
 * Slot order follows the requested clockwise path, starting at back right. */
(() => {
  'use strict';
  const region=(name,front,d0,d1,l0,l1)=>Object.freeze({name,front,d0,d1,l0,l1,d:(d0+d1)/2,L:(l0+l1)/2});
  const rows=(frontDepth,frontCount,backCount)=>{
    const back=Array.from({length:backCount},(_,i)=>region('後排'+(backCount===3?['右','中','左'][i]:['右','左'][i]),false,frontDepth,9,-4.5+i*9/backCount,-4.5+(i+1)*9/backCount));
    const front=Array.from({length:frontCount},(_,i)=>region(frontCount===1?'前排':'前排'+['左','右'][i],true,0,frontDepth,4.5-(i+1)*9/frontCount,4.5-i*9/frontCount));
    return Object.freeze([...back,...front]);
  };
  const layouts=Object.freeze({1:Object.freeze([region('全場',false,0,9,-4.5,4.5)]),3:rows(3,1,2),4:rows(4.5,2,2),5:rows(3.6,2,3)});
  const get=n=>layouts[n]||null;
  const home=(n,k)=>n===1?[6,0]:[get(n)[k].d,get(n)[k].L];
  const rotate=ids=>ids.length===1?ids.slice():[ids.at(-1),...ids.slice(0,-1)];
  const owner=(n,d,L)=>{
    const zones=get(n);d=Math.max(0,Math.min(9-1e-9,d));L=Math.max(-4.5,Math.min(4.5-1e-9,L));
    return zones.findIndex(z=>d>=z.d0&&d<z.d1&&L>=z.l0&&L<z.l1);
  };
  const relations=n=>{
    const z=get(n),out=[];
    for(let i=0;i<z.length;i++)for(let j=i+1;j<z.length;j++){
      const a=z[i],b=z[j];
      if(a.front===b.front)out.push({axis:'L',low:a.L<b.L?i:j,high:a.L<b.L?j:i});
      else if(Math.min(a.l1,b.l1)>Math.max(a.l0,b.l0)+1e-9)out.push({axis:'d',low:a.front?i:j,high:a.front?j:i});
    }
    return out;
  };
  const overlap=(n,positions)=>relations(n).find(({axis,low,high})=>positions[low]&&positions[high]&&positions[low][axis]>positions[high][axis]+0.15)||null;
  globalThis.CourtFormations=Object.freeze({get,home,rotate,owner,relations,overlap});
})();
