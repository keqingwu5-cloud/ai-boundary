/* Synthetic-only visual demonstration. Never stored in aiBrain.v1. */
export function syntheticBrainSnapshot() {
  return {
    version: 'SYNTHETIC-DEMO',
    brains: [
      { id:'main', name:'第一大腦（示範）', parentBrainId:null, rootNodeId:null },
      { id:'research', name:'研究子腦（示範）', parentBrainId:'main', rootNodeId:'r1' },
      { id:'engineering', name:'工程子腦（示範）', parentBrainId:'main', rootNodeId:'e1' }
    ],
    nodes: [
      { id:'m1', brainId:'main', parentId:null, title:'系統的主要問題', kind:'question', status:'researching', oneLiner:'定義範圍、來源與未知。', source:null },
      { id:'m2', brainId:'main', parentId:'m1', title:'觀測與量測', kind:'extension', status:'open', oneLiner:'比較不同時間窗與空間尺度。' },
      { id:'m3', brainId:'main', parentId:'m1', title:'任務協作', kind:'extension', status:'open', oneLiner:'區分已發布、已接收與已審核。' },
      { id:'r1', brainId:'research', parentId:'m2', title:'世界如棋局', kind:'direction', status:'researching', oneLiner:'保留跨尺度與參照框架。' },
      { id:'r2', brainId:'research', parentId:'r1', title:'距離的多種定義', kind:'extension', status:'open', oneLiner:'地理距離和圖譜步數不是同一種度量。' },
      { id:'r3', brainId:'research', parentId:'r1', title:'證據與反證', kind:'extension', status:'open', counterEvidence:[{ id:'syn1', text:'示範反例' }] },
      { id:'e1', brainId:'engineering', parentId:'m3', title:'工程證據面板', kind:'direction', status:'open' },
      { id:'e2', brainId:'engineering', parentId:'e1', title:'接收來源分級', kind:'extension', status:'open' },
      { id:'e3', brainId:'engineering', parentId:'e1', title:'發布與部署 Gate', kind:'extension', status:'open' }
    ],
    links: [
      { id:'x1', from:'r3', to:'e1', kind:'cross' },
      { id:'d1', from:'m1', to:'m2', kind:'derived' }
    ],
    history:[{ ts:0, action:'synthetic_seed', payload:{} }]
  };
}
