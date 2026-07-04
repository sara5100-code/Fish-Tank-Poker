// ---- HAND HELPERS ----
// ---- GTO ハンドレンジ表（169手エクイティ順） ----
// Rank 1=最強(AA), 169=最弱(72o)
const HAND_RANK_169=[
  'AA','KK','QQ','JJ','TT','AKs',
  'AKo','AQs','99','AQo','AJs','KQs','88','AJo','KQo','ATs',
  'KJs','QJs','77','ATo','KJo','KTs','A9s','QTs','QJo','JTs','66',
  'A8s','KTo','QTo',
  'J9s','55','T9s','A7s','K9s','Q9s','98s','A6s','JTo','87s',
  'A5s','44','K8s','J8s','Q8s','A4s',
  '76s','T8s','A3s','65s','K7s','33','J7s','A2s','54s','Q7s',
  '97s','T7s','K6s','86s','75s','22','J6s','K5s','Q6s',
  '96s','64s','T6s','85s','J5s','K4s','53s','A9o','J4s','95s','94s',
  'Q5s','K3s','74s','J3s','42s','Q4s',
  'K2s','63s','J2s','Q3s','84s','A8o','T5s','73s','Q2s','52s',
  'T4s','62s','32s','A7o','T3s','93s','T2s','83s','43s','A6o',
  '92s','J9o','72s','T9o','A5o','K9o','82s','Q9o','98o','87o',
  'A4o','76o','J8o','K8o','A3o','T8o','65o','Q8o','97o','A2o',
  'J7o','54o','K7o','86o','75o','Q7o','J6o','K6o','96o','T7o',
  '64o','J5o','85o','K5o','53o','T6o','J4o','74o','Q6o','K4o',
  '95o','J3o','42o','Q5o','84o','K3o','63o','J2o','Q4o','K2o',
  '73o','Q3o','52o','T5o','62o','Q2o','T4o','32o','93o','T3o',
  '83o','T2o','43o','92o','94o','72o','82o'
];
// O(1)ルックアップ用マップ (1始まり)
const HAND_STRENGTH={};
HAND_RANK_169.forEach((h,i)=>HAND_STRENGTH[h]=i+1);
// コンボ数累積フラクション: ペア=6, スーテッド=4, オフスーツ=12 combos (計1326)
// handFrac=0.00 → 最強(AA付近), handFrac=1.00 → 最弱(72o)
const HAND_COMBO_FRAC={};
(()=>{let _c=0;HAND_RANK_169.forEach(h=>{_c+=(h[0]===h[1]?6:h.length>2&&h[2]==='s'?4:12);HAND_COMBO_FRAC[h]=_c/1326;});})();

// 2枚のカードからハンド種別文字列を返す ('AKs','AKo','AA' など)
function handType(c1,c2){
  const RSTR='23456789TJQKA';
  const i1=RSTR.indexOf(c1.rank),i2=RSTR.indexOf(c2.rank);
  const hi=i1>=i2?c1:c2,lo=i1>=i2?c2:c1;
  if(hi.rank===lo.rank) return hi.rank+hi.rank;
  return hi.rank+lo.rank+(c1.suit===c2.suit?'s':'o');
}
// ハンドランク(1-169)を返す
function handRank(c1,c2){return HAND_STRENGTH[handType(c1,c2)]||169;}
function handDesc(c1,c2){
  const h=c1.value>=c2.value?c1:c2,l=c1.value>=c2.value?c2:c1;
  if(c1.value===c2.value)return 'ポケット'+(RANK_JP[h.rank]||h.rank)+'('+h.rank+h.rank+')';
  const suf=c1.suit===c2.suit?'スーテッド':'オフスーツ';
  return h.rank+l.rank+(c1.suit===c2.suit?'s':'o')+'('+(RANK_JP[h.rank]||h.rank)+(RANK_JP[l.rank]||l.rank)+' '+suf+')';
}

// ---- ポジション別オープンレンジ (GTO基準, 6-max) ----
// 値は「全169手中の上位X%」= オープンする割合
const POS_RANGE={
  easy:  {UTG:0.28,'UTG+1':0.30,MP:0.33,LJ:0.36,HJ:0.40,CO:0.45,BTN:0.58,SB:0.45,BB:0},
  medium:{UTG:0.17,'UTG+1':0.19,MP:0.21,LJ:0.23,HJ:0.25,CO:0.27,BTN:0.38,SB:0.28,BB:0},
  hard:  {UTG:0.12,'UTG+1':0.14,MP:0.16,LJ:0.18,HJ:0.20,CO:0.22,BTN:0.30,SB:0.22,BB:0}
};

// $2/$5ライブキャッシュ訓練用の実戦レンジ。
// レーキ・マルチウェイ・ルーズコールを考慮し、EPは締め、BTN/COで利益を取りに行く。
const LIVE25_OPEN_RANGE={
  9:{UTG:0.10,'UTG+1':0.12,MP:0.15,LJ:0.18,HJ:0.22,CO:0.29,BTN:0.43,SB:0.34,BB:0},
  8:{UTG:0.11,'UTG+1':0.13,MP:0.16,HJ:0.22,CO:0.30,BTN:0.43,SB:0.34,BB:0},
  7:{UTG:0.12,MP:0.17,HJ:0.23,CO:0.31,BTN:0.44,SB:0.35,BB:0},
  6:{UTG:0.16,HJ:0.23,CO:0.31,BTN:0.45,SB:0.36,BB:0},
  5:{UTG:0.18,MP:0.24,CO:0.32,BTN:0.46,SB:0.37,BB:0},
  4:{UTG:0.22,CO:0.34,BTN:0.48,SB:0.38,BB:0},
  3:{BTN:0.50,SB:0.42,BB:0},
  2:{SB:0.55,BB:0}
};
function live25OpenPct(pos,numPlayers){
  const t=LIVE25_OPEN_RANGE[Math.max(2,Math.min(9,numPlayers))]||LIVE25_OPEN_RANGE[6];
  return t[pos]!=null?t[pos]:(POS_RANGE.medium[pos]||0.20);
}
function preflopSizePlan(hr,d,limpCount,is3bet,isISO,pos){
  const bb=hr.bigBlind||5;
  const ip=['BTN','CO'].includes(pos);
  const mode=getRangeMode();
  const tctx=hr&&hr.tournamentContext;
  if(is3bet){
    const mult=mode==='gto'?(ip?2.6:3.1):(ip?3.0:3.6);
    const target=Math.round((d.toCall||bb)*mult);
    return{target,label:'推奨: '+target+'T 前後の3BET（'+(ip?'IPは約3倍':'OOPは約3.5〜4倍')+'）'};
  }
  if(isISO){
    const bbMult=3.5+limpCount;
    const target=Math.round(bb*bbMult);
    return{target,label:'推奨: '+target+'T 前後のISOレイズ（'+limpCount+'リンパーに対して約'+bbMult+'BB）'};
  }
  const bbMult=tctx&&tctx.enabled
    ?(tctx.stackBB<=20?2.0:(tctx.stackBB<=30?2.2:2.3))
    :(mode==='gto'?2.3:((pos==='SB'||pos==='UTG'||pos==='UTG+1')?3.0:2.5));
  const target=Math.round(bb*bbMult);
  return{target,label:'推奨: '+target+'T 前後のオープン（'+bbMult+'BB）。'+(tctx&&tctx.enabled?'BBアンティ環境ではポットが大きく、浅いほど小さめオープンで十分です。':'$2/$5ライブではルーズコールが多い卓なら3BB寄り')};
}