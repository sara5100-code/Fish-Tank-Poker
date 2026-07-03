const TOURNAMENT_PRESETS={
  bbante_basic:{
    id:'bbante_basic',label:'BBアンティ基礎',phase:'BBアンティ基礎',players:8,sb:100,bb:200,stackBB:25,bbAnteBB:1,
    playersLeft:18,seatsPaid:3,avgStackBB:25,
    note:'BBアンティで初期ポットが大きい局面。リングよりスチール価値が高く、標準オープンは2.0〜2.3BB寄り。'
  },
  early:{
    id:'early',label:'序盤戦',phase:'序盤',players:8,sb:100,bb:200,stackBB:40,bbAnteBB:1,
    playersLeft:24,seatsPaid:3,avgStackBB:38,
    note:'まだポストフロップ余地あり。ただしBBアンティでコストが重く、ルースコールはリングより早く損になりやすい。'
  },
  middle:{
    id:'middle',label:'中盤ショート化',phase:'中盤',players:8,sb:300,bb:600,stackBB:20,bbAnteBB:1,
    playersLeft:14,seatsPaid:3,avgStackBB:23,
    note:'12〜25BB帯。オープン額は小さく、3bet jam/reshove/オープンフォールドの判断が中心。'
  },
  bubble:{
    id:'bubble',label:'バブル・チケット目前',phase:'バブル',players:9,sb:500,bb:1000,stackBB:14,bbAnteBB:1,
    playersLeft:7,seatsPaid:3,avgStackBB:17,
    note:'チケット目前。chipEVより通過確率を優先し、ミドル同士の衝突回避とショートの押し引きが重要。'
  },
  final_table:{
    id:'final_table',label:'FT・ペイジャンプ',phase:'FT',players:6,sb:800,bb:1600,stackBB:22,bbAnteBB:1,
    playersLeft:6,seatsPaid:3,avgStackBB:24,
    note:'ファイナルテーブル。ペイジャンプとスタック順位を見ながら、ビッグは圧をかけ、ミドルはカバーされる薄い衝突を避ける。'
  },
  heads_up:{
    id:'heads_up',label:'HU・最終決戦',phase:'HU',players:2,sb:1000,bb:2000,stackBB:25,bbAnteBB:0,
    playersLeft:2,seatsPaid:1,avgStackBB:25,
    note:'ヘッズアップ。ICM圧は下がり、レンジが大きく広がる。SB/BTNの参加頻度、BB防衛、ポストフロップの主導権が中心。'
  }
};
// [Codex fix 2026-05-27] Tモードの練習テーマ。まずは文脈とレビュー軸を固定し、生成ロジックは段階的に寄せる。
const TOURNAMENT_FOCUS_PRESETS={
  general:{
    id:'general',label:'総合練習',preset:null,
    goal:'局面別の標準判断を広く確認する。',
    review:'有効BB・BBアンティ・ICM圧を見て、リングゲームとの差を説明する。'
  },
  bbante_steal:{
    id:'bbante_steal',label:'BBアンティ基礎・スチール',preset:'bbante_basic',
    goal:'BBアンティで初期ポットが大きい時の小さめオープン、後ろ寄りスチール、BB防衛を覚える。',
    review:'2.0〜2.3BBオープン、スチール価値、BBの広いが選別された防衛を重点レビュー。'
  },
  reshove20:{
    id:'reshove20',label:'20BB reshove練習',preset:'middle',
    goal:'20BB前後で非BBフラットを減らし、3bet jam / fold の判断を鍛える。',
    review:'非BBコールを厳しく見て、Axs・ペア・強スーテッドのreshove候補を重点レビュー。'
  },
  openjam14:{
    id:'openjam14',label:'14BB open jam練習',preset:'bubble',
    goal:'12〜14BBで後ろ寄りポジションのopen jamと小さめオープンの使い分けを覚える。',
    review:'CO/BTN/SBのopen jam候補、EPの締め、強すぎる手の小オープン混合を重点レビュー。'
  },
  bubble_call:{
    id:'bubble_call',label:'バブル薄コール回避',preset:'bubble',
    goal:'チケット目前で、勝てるかだけでなく負けた時の通過率低下を見て薄いコールを捨てる。',
    review:'カバー関係、ICM圧、薄いcallとワンペア払いすぎを重点レビュー。'
  },
  bb_defend:{
    id:'bb_defend',label:'BBディフェンス練習',preset:'middle',
    goal:'BBアンティ込みの良いポットオッズで、守る手と捨てる手を区別する。',
    review:'スーテッド性・連結性・ペア価値・弱オフスーツの逆インプライドを重点レビュー。'
  },
  ft_payjump:{
    id:'ft_payjump',label:'FTペイジャンプ',preset:'final_table',
    goal:'FTでペイジャンプ、スタック順位、カバー関係を見て、攻める側と受ける側を分ける。',
    review:'カバーされる薄いコール、ビッグスタックの圧、後ろ寄りスチール機会、ミドル同士の衝突回避を重点レビュー。'
  },
  hu_aggression:{
    id:'hu_aggression',label:'HU攻防',preset:'heads_up',
    goal:'HUでレンジを広げ、SB/BTNの主導権とBB防衛を鍛える。',
    review:'SBの広いオープン/リンプ、BBの広い防衛、降りすぎ、ポストフロップの小ベット主導権を重点レビュー。'
  }
};
function cloneTournamentPreset(id){
  const p=TOURNAMENT_PRESETS[id]||TOURNAMENT_PRESETS.bbante_basic;
  return{...p,enabled:true,bbAnte:Math.round(p.bb*(p.bbAnteBB||0))};
}
function applyTournamentFocus(ctx,focusId){
  const f=TOURNAMENT_FOCUS_PRESETS[focusId]||TOURNAMENT_FOCUS_PRESETS.general;
  return{...ctx,focusId:f.id,focusLabel:f.label,focusGoal:f.goal,focusReview:f.review};
}
function tournamentContextText(ctx){
  if(!ctx||!ctx.enabled)return'';
  return ctx.label+' / '+ctx.phase+' / '+ctx.stackBB+'BB / BBアンティ '+(ctx.bbAnteBB||0)+'BB / 残り'+ctx.playersLeft+'人・通過'+ctx.seatsPaid+'枠'+(ctx.focusLabel?' / テーマ: '+ctx.focusLabel:'');
}
// [Codex fix 2026-05-27] Tモードの評価軸を局面ごとに明示し、あとから減点ロジックを拡張しやすくする。
function tournamentEvalAxes(ctx,stackBB){
  if(!ctx||!ctx.enabled)return{stackBand:'',icmPressure:'',primary:''};
  const bb=stackBB!=null?stackBB:(ctx.stackBB||25);
  let stackBand='ディープ';
  if(bb<=10)stackBand='10BB以下 push/fold';
  else if(bb<=17)stackBand='12〜17BB push/fold';
  else if(bb<=25)stackBand='18〜25BB reshove';
  else if(bb<=34)stackBand='26〜34BB 標準ショート';
  else stackBand='35BB+ ポストフロップ';

  const left=ctx.playersLeft||0,paid=ctx.seatsPaid||0;
  let icmPressure='低';
  if(ctx.phase==='HU')icmPressure='低';
  else if(ctx.phase==='バブル'||(left&&paid&&left<=paid*2.2))icmPressure='高';
  else if(left&&paid&&left<=paid*4)icmPressure='中';

  let primary='BBアンティのスチール価値';
  let phaseAxis='序盤のレンジ健全性';
  if(ctx.phase==='HU')primary='HUの広いレンジと主導権';
  else if(icmPressure==='高')primary='ICM/チケット圧とカバー関係';
  else if(bb<=17)primary='push/foldとopen jam';
  else if(bb<=25)primary='小さめオープン・非BBフラット削減・reshove';
  else if(ctx.phase==='序盤')primary='広すぎるコール抑制とポストフロップ実現率';
  if(ctx.phase==='中盤')phaseAxis='中盤の有効BB/reshove';
  else if(ctx.phase==='HU')phaseAxis='HUの広いレンジ/降りすぎ抑制';
  else if(ctx.phase==='FT')phaseAxis='FTのペイジャンプ/スタック順位';
  else if(ctx.phase==='バブル'||icmPressure==='高')phaseAxis='バブルのICM/カバー関係';
  else if(bb<=17)phaseAxis='ショート帯のpush/fold';
  return{stackBand,icmPressure,primary,phaseAxis};
}
function tournamentAxisSummary(ctx,stackBB){
  const a=tournamentEvalAxes(ctx,stackBB);
  if(!a.primary)return'';
  return 'スタック帯: '+a.stackBand+' / ICM圧: '+a.icmPressure+' / 主軸: '+a.primary+' / フェーズ軸: '+a.phaseAxis;
}
// [Codex fix 2026-06-05] FTはペイジャンプ・スタック順位・カバー関係で、同じハンドの攻め/受けを分ける。
// [Codex fix 2026-06-05] FTは順位だけでなく、カバー関係と下位スタック数から立場を分けて減点重みを変える。
function tournamentFinalTableStackRole(ctx,d,stackBB){
  const players=(ctx&&((ctx.playersLeft&&ctx.playersLeft<=9?ctx.playersLeft:null)||ctx.players))||6;
  const rank=d&&d.stackRank!=null?d.stackRank:null;
  const shorter=d&&d.shorterStackCount!=null?d.shorterStackCount:0;
  const coverCount=d&&d.coverCount!=null?d.coverCount:shorter;
  const coveredBy=d&&d.coveredByCount!=null?d.coveredByCount:0;
  const shortestOpp=d&&d.shortestOppStackBB!=null?d.shortestOppStackBB:null;
  const bb=stackBB||((ctx&&ctx.stackBB)||20);
  let role='ミドル';
  if(rank===1||(coverCount>=Math.max(3,players-2)&&coveredBy===0))role='チップリーダー';
  else if(rank===2||(coverCount>=Math.max(2,players-3)&&coveredBy<=1))role='セカンド';
  else if(bb<=7||rank===players||shorter===0||(shortestOpp!=null&&bb<=shortestOpp+2))role='最短ショート';
  else if(bb<=12||shorter<=1)role='ショート';
  else if(coveredBy>=1&&coverCount>=1)role='ミドル';
  const profile={
    role,
    callMultiplier:1.0,
    attackMultiplier:1.0,
    foldMultiplier:1.0,
    postflopCallMultiplier:1.0,
    missedStealMultiplier:1.0,
    policy:'FTでは自分の立場により、同じハンドでも攻める価値と受ける危険度が変わります。',
    risk:'スタック立場を無視すると、守るべきミドルが飛びすぎたり、攻めるべきカバー側がチップを増やせません。'
  };
  if(role==='チップリーダー'){
    profile.callMultiplier=0.96;profile.attackMultiplier=0.86;profile.foldMultiplier=1.08;profile.postflopCallMultiplier=0.96;profile.missedStealMultiplier=1.14;
    profile.policy='チップリーダーはカバー圧を使い、特に後ろが中位/ショートなら先に攻める価値が高い立場です。';
    profile.risk='ただしセカンド級との巨大衝突は避け、圧をかける相手を選びます。';
  }else if(role==='セカンド'){
    profile.callMultiplier=1.10;profile.attackMultiplier=0.96;profile.foldMultiplier=0.96;profile.postflopCallMultiplier=1.06;profile.missedStealMultiplier=1.02;
    profile.policy='セカンドは下位に圧をかけられますが、チップリーダーとの衝突はペイジャンプEVを大きく失います。';
    profile.risk='CLにカバーされる局面の薄いコール/リレイズは、chipEVよりICM損失を重く見ます。';
  }else if(role==='ミドル'){
    profile.callMultiplier=1.24;profile.attackMultiplier=1.02;profile.foldMultiplier=0.84;profile.postflopCallMultiplier=1.16;profile.missedStealMultiplier=0.96;
    profile.policy='ミドルは最もICM圧を受けやすく、カバーされる薄い受けを避ける一方、降りすぎない攻め所を選びます。';
    profile.risk='下に短いスタックがいるのに中途半端なコールで飛ぶのが、FTで一番高い失点になりやすいです。';
  }else if(role==='ショート'){
    profile.callMultiplier=0.98;profile.attackMultiplier=0.92;profile.foldMultiplier=1.10;profile.postflopCallMultiplier=0.98;profile.missedStealMultiplier=1.16;
    profile.policy='ショートは待つだけではアンティで削られるため、先に入れるpush/foldの実行力を重視します。';
    profile.risk='受けオールインは相手レンジが強くなりやすいので、コールより先入れのフォールドエクイティを優先します。';
  }else if(role==='最短ショート'){
    profile.callMultiplier=0.92;profile.attackMultiplier=0.84;profile.foldMultiplier=1.20;profile.postflopCallMultiplier=0.96;profile.missedStealMultiplier=1.28;
    profile.policy='最短ショートはペイジャンプを待つ余地が小さく、良い先入れスポットを逃す減点を重く見ます。';
    profile.risk='それでも受けで飛ぶより、フォールドエクイティが残る先入れを優先します。';
  }
  return profile;
}
// [Codex fix 2026-06-05] FTでは自分の立場だけでなく、衝突相手がCL級/同格/ショートかで受けと攻めの重みを変える。
function tournamentFinalTableCollisionProfile(ctx,d,stackRole,stackBB){
  const heroChips=d&&d.playerChipsBefore?d.playerChipsBefore:0;
  const bb=(ctx&&ctx.bb)||1;
  const heroBB=stackBB||(heroChips&&bb?heroChips/bb:((ctx&&ctx.stackBB)||20));
  const oppChips=(d&&(d.villainChipsBefore||d.opponentChipsBefore||d.aggressorChipsBefore))||0;
  const oppBB=oppChips&&bb?oppChips/bb:null;
  const covered=d&&(d.coverState==='covered'||d.coverState==='mixed_covered');
  const covering=d&&(d.coverState==='covering'||d.coverState==='mixed_covering');
  const facing=!!(d&&d.facingRaise&&(d.toCall||0)>0);
  let opponent='不明';
  let risk='衝突相手のスタック立場が不明なため、カバー関係を中心に保守的に評価します。';
  let policy='FTでは相手を選んで衝突します。同じハンドでも、相手がCL級かショートかでEVの質が変わります。';
  let callMultiplier=1.0,attackMultiplier=1.0,foldMultiplier=1.0,postflopCallMultiplier=1.0;
  if(d&&d.ftOpponentRole)opponent=d.ftOpponentRole;
  else if(oppBB!=null){
    if(oppBB>=Math.max(heroBB*1.45,heroBB+10))opponent='上位カバー';
    else if(oppBB<=Math.min(heroBB*0.55,10))opponent='ショート';
    else if(Math.abs(oppBB-heroBB)<=Math.max(4,heroBB*0.18))opponent='同格';
    else if(oppBB>heroBB)opponent='やや上位';
    else opponent='下位スタック';
  }else if(covered)opponent='上位カバー';
  else if(covering)opponent='下位スタック';
  if(opponent==='上位カバー'||opponent==='やや上位'){
    callMultiplier=1.16;postflopCallMultiplier=1.10;foldMultiplier=0.90;attackMultiplier=1.04;
    policy='上位カバー相手には、薄い受けをかなり絞ります。勝っても増える価値より、負けた時の順位落ちが重くなりやすい局面です。';
    risk='CL級/上位スタックへのヒーローコールは、ライブ実戦でもバリュー過多に捕まりやすいです。';
  }else if(opponent==='同格'){
    callMultiplier=1.10;postflopCallMultiplier=1.08;foldMultiplier=0.96;attackMultiplier=1.00;
    policy='同格ミドルとの衝突は、勝てば大きい一方で負けると順位が崩れます。コール側は特にレンジを締めます。';
    risk='ミドル同士の薄い衝突は、下位スタックが残るFTでは高コストです。';
  }else if(opponent==='ショート'||opponent==='下位スタック'){
    callMultiplier=covering?0.90:0.98;postflopCallMultiplier=covering?0.94:1.00;foldMultiplier=covering?1.08:1.00;attackMultiplier=covering?0.90:0.96;
    policy='下位/ショート相手にはカバー圧を使えます。特に自分が飛ばない立場なら、攻めと適正な受けを少し広げます。';
    risk='ただしショートの先入れレンジは強く寄ることもあるため、何でも受けるのではなくポットオッズとレンジを分けます。';
  }
  if(stackRole&&stackRole.role==='セカンド'&&(opponent==='上位カバー'||opponent==='やや上位')){
    callMultiplier*=1.08;postflopCallMultiplier*=1.06;
    risk+=' セカンドがCL級とぶつかる局面は、FTで最も避けたい大型衝突の一つです。';
  }
  return{opponent,oppBB:oppBB!=null?Math.round(oppBB*10)/10:null,callMultiplier,attackMultiplier,foldMultiplier,postflopCallMultiplier,policy,risk,facing};
}
// [Codex fix 2026-06-05] FT専用の簡易レンジ表。立場・衝突相手・有効BBでpush/foldと受けの許容幅を変える。
function tournamentFinalTableRangeProfile(ctx,d,holeCards,stackBB,pos,stackRole,collision){
  if(!ctx||!ctx.enabled||ctx.phase!=='FT'||!d||d.street!=='preflop'||!holeCards||holeCards.length<2)return null;
  const ht=handType(holeCards[0],holeCards[1]);
  const handFrac=HAND_COMBO_FRAC[ht]||0.99;
  const shape=simpleHandShape(holeCards[0],holeCards[1]);
  const bb=stackBB||ctx.stackBB||20;
  const role=(stackRole&&stackRole.role)||'ミドル';
  const opponent=(collision&&collision.opponent)||'不明';
  const facing=!!(d.facingRaise&&(d.toCall||0)>0);
  const raiseLike=d.action==='raise'||d.action==='allin';
  const late=['CO','BTN','SB'].includes(pos||d.position||'');
  const ep=['UTG','UTG+1'].includes(pos||d.position||'');
  const callCommitRatio=d.playerChipsBefore?((d.amount||d.toCall||0)/Math.max(1,d.playerChipsBefore)):0;
  const callOff=facing&&d.action==='call'&&(callCommitRatio>=0.45||d.facingAllIn);
  let lane='open',cap=late?0.34:ep?0.14:0.22,label='Open',baseline='FT標準オープン';
  if(role==='チップリーダー'){cap+=late?0.14:0.06;}
  else if(role==='セカンド'){cap+=late?0.04:0.00;}
  else if(role==='ミドル'){cap-=ep?0.03:0.00;}
  else if(role==='ショート'){cap+=late?0.08:0.03;}
  else if(role==='最短ショート'){cap+=late?0.16:0.08;}
  if(bb<=10)cap+=late?0.08:0.04;
  else if(bb>=30&&role!=='チップリーダー')cap-=0.02;
  if(!facing&&d.action==='allin'){
    lane='openJam';label='Open jam';baseline='FT push/fold先入れ';
    cap=late?0.34:ep?0.10:0.20;
    if(role==='チップリーダー')cap+=0.08;
    else if(role==='最短ショート')cap+=0.18;
    else if(role==='ショート')cap+=0.12;
    else if(role==='ミドル')cap-=0.02;
    if(bb<=8)cap+=0.14;
    else if(bb<=12)cap+=0.08;
    else if(bb>18)cap-=0.10;
  }else if(facing&&raiseLike){
    lane='reshove';label='Reshove / 3bet jam';baseline='FT押し返し';
    cap=late?0.18:0.11;
    if(role==='チップリーダー'&&opponent!=='上位カバー')cap+=0.04;
    if(opponent==='上位カバー'||opponent==='同格')cap-=0.03;
    if(shape.wheelAxs)cap+=0.035;
    if(shape.suitedBroadway)cap+=0.025;
    if(shape.pair&&shape.lo>=7)cap+=0.035;
  }else if(facing&&d.action==='call'){
    lane=callOff?'callOff':(pos==='BB'?'bbDefend':'flat');
    label=callOff?'All-in call':pos==='BB'?'BB defend':'Flat';
    baseline=callOff?'FTオールイン受け':'FTコールレンジ';
    cap=callOff?0.11:(pos==='BB'?0.38:0.08);
    if(callOff&&opponent==='上位カバー')cap-=role==='セカンド'?0.080:0.040;
    if(callOff&&opponent==='同格')cap-=0.025;
    if(callOff&&(opponent==='ショート'||opponent==='下位スタック')&&role==='チップリーダー')cap+=0.12;
    if(callOff&&(role==='ショート'||role==='最短ショート'))cap+=0.035;
    if(!callOff&&pos!=='BB'&&role==='ミドル')cap-=0.025;
    if(shape.suitedBroadway)cap+=callOff?0.015:0.025;
    if(shape.wheelAxs&&!callOff)cap+=0.025;
    if(shape.pair)cap+=callOff?(shape.lo>=9?0.04:0.00):0.035;
  }
  cap=Math.max(0.025,Math.min(0.72,cap));
  const margin=cap-handFrac;
  let verdict='レンジ内',severity='good';
  if(margin<0&&handFrac<=cap+0.045){verdict='境界';severity='border';}
  else if(margin<0){verdict='レンジ外';severity='bad';}
  if(lane==='callOff'&&(opponent==='上位カバー'||opponent==='同格')&&margin<-0.025){verdict='レンジ外';severity='bad';}
  const mix=severity==='good'
    ?(lane==='callOff'?'Fold 0-20% / Call 65-90% / Jamなし':lane==='openJam'?'Fold 0-20% / Open jam 60-90% / 小レイズ 0-20%':'Fold 0-20% / 実行 70-95%')
    :severity==='border'
      ?(lane==='callOff'?'Fold 45-70% / Call 25-50% / Jamなし':'Fold 35-65% / 実行 25-55%')
      :(lane==='callOff'?'Fold 80-98% / Call 2-20% / Jamなし':'Fold 75-95% / 実行 5-25%');
  const risk=lane==='callOff'
    ?(opponent==='上位カバー'||opponent==='同格'?'受け側はレンジを強く絞る。負けると順位落ちが大きい':'ショート相手でも受けは相手レンジを確認する')
    :lane==='openJam'||lane==='reshove'?'フォールドエクイティが残る先入れ/押し返しを優先':'FTでは下限オープンと非BBフラットを混同しない';
  return{handType:ht,handPercent:Math.round(handFrac*100),stackBB:bb,position:pos,lane,label,baseline,capPercent:Math.round(cap*100),marginPercent:Math.round(margin*100),verdict,severity,role,opponent,mix,risk};
}
function tournamentFinalTableRangeProfileText(p){
  if(!p)return'';
  const laneText={
    open:'先に参加する判断',
    openJam:'先にオールインする判断',
    reshove:'押し返す判断',
    callOff:'オールインを受ける判断',
    bbDefend:'BBで守る判断',
    flat:'レイズにコールする判断'
  }[p.lane]||'参加判断';
  const verdictText=p.severity==='good'
    ?'レンジ内です'
    :p.severity==='border'
      ?'境界です'
      :'レンジ外寄りです';
  const roleText=(p.role||'このスタック')+'として、'+(p.opponent||'相手')+'とぶつかる場面です。';
  let riskText=p.risk||'';
  if(p.lane==='bbDefend')riskText='BBは価格が良いので守れますが、ヒット後に弱いワンペアで払いすぎないことが条件です。';
  else if(p.lane==='flat')riskText='BB以外のコールは、ポジションと後続の押し返しで苦しくなりやすいです。';
  else if(p.lane==='callOff')riskText='受ける側は、負けた時の順位落ちが大きいのでレンジをかなり絞ります。';
  else if(riskText==='FTでは下限オープンと非BBフラットを混同しない')riskText='先に入るならレイズで主導権を取り、レイズを受けるコールとは別物として考えます。';
  else if(/フォールドエクイティ/.test(riskText))riskText='押し返す時は、相手を降ろせる余地がどれだけ残っているかを重く見ます。';
  else if(/受け側はレンジを強く絞る/.test(riskText))riskText='受ける側は、負けた時の順位落ちが大きいのでレンジをかなり絞ります。';
  return roleText+p.handType+'は'+laneText+'では'+verdictText+'。目安レンジは上位'+p.capPercent+'%までで、この手は上位'+p.handPercent+'%です。'+riskText;
}
// [Codex fix 2026-06-05] FTのポストフロップは、chipEVの手役評価にICM・カバー関係・SPRを重ねて受けすぎ/打ちすぎを検出する。
function tournamentFinalTablePostflopProfile(ctx,d,role,tex,stackBB,pos,ftProfile,nOpponents){
  if(!ctx||!ctx.enabled||ctx.phase!=='FT'||!d||d.street==='preflop'||!role)return null;
  const lane=d.action==='check'?'check':d.action==='call'?'call':(d.action==='raise'||d.action==='bet'||d.action==='allin')?'bet':d.action;
  const pairTier=role.pairTier||'';
  const note=role.note||'';
  const onePair=!!pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(note);
  const weakPair=['board_pair','under_pair','bottom_pair','low_pair','second_pair'].includes(pairTier)||role.role==='medium';
  const strongOnePair=['top_pair','overpair'].includes(pairTier)&&(role.role==='strong'||role.role==='value');
  const draw=!!(role.draw&&(role.draw.flush||role.draw.oesd||role.draw.gutshot||role.draw.straight));
  const strongMade=!!(role.isNut||role.role==='nutted'||role.role==='monster'||role.role==='strong'&&!onePair);
  const danger=!!(tex&&(tex.flushy>=3||tex.flushDraw||tex.straightDraw||tex.dynamic||tex.paired));
  const spr=calcSPR(d.playerChipsBefore||0,d.pot||0);
  const basePot=d.toCall>0?Math.max(1,(d.pot||0)-(d.toCall||0)):Math.max(1,d.pot||1);
  const sizePct=lane==='call'?Math.round((d.toCall||d.amount||0)/basePot*100):(d.pot?Math.round((d.amount||0)/Math.max(1,d.pot)*100):0);
  const stackRole=ftProfile&&ftProfile.stackRole||'不明';
  const collision=ftProfile&&ftProfile.collisionProfile||null;
  const opponent=collision&&collision.opponent||'不明';
  const covered=d.coverState==='covered'||d.coverState==='mixed_covered';
  const covering=d.coverState==='covering'||d.coverState==='mixed_covering';
  let verdict='normal',severity='normal';
  let policy='FTポストフロップでは、手役の強さに加えて負けた時の順位落ちと次ストリートのSPRを見ます。';
  let risk='SPR約'+spr+' / '+stackRole+' vs '+opponent+(danger?' / 危険ボード':' / 静的ボード');
  if(nOpponents>=2)risk+=' / マルチウェイ';
  if(lane==='call'){
    if(covered&&(opponent==='上位カバー'||opponent==='同格')&&(weakPair||onePair||draw)&&!strongMade&&(d.street==='river'||sizePct>=50||danger)){
      verdict='bad';severity='bad';
      policy='カバーされる側のFTコールは、必要EQだけでは正当化しません。ワンペア/弱ドローはフォールド寄りに倒します。';
      risk+=' / 負けるとペイジャンプと順位を同時に失う受け';
    }else if(covered&&onePair&&!strongMade&&(sizePct>=40||danger)){
      verdict='border';severity='border';
      policy='FTではワンペアの受けは相手依存のブラフキャッチ。特に上位スタック相手は慎重にします。';
    }else if(covering&&(opponent==='ショート'||opponent==='下位スタック')&&(strongOnePair||strongMade)&&sizePct<=75){
      verdict='coverValue';severity='good';
      policy='カバー側がショート相手に強いSDVで受ける形は、CL級への受けと分けて少し広く許容します。';
    }
  }else if(lane==='bet'){
    if(covered&&!strongMade&&(weakPair||(onePair&&danger&&sizePct>=50)||sizePct>=75)){
      verdict='overbuild';severity='bad';
      policy='カバーされる側がFTでワンペア/弱いSDVから大きくポットを作るのは、失敗時の順位落ちが大きすぎます。';
      risk+=' / 自分から脱落リスクを増やしている';
    }else if(covering&&(opponent==='ショート'||opponent==='下位スタック')&&strongMade){
      verdict='pressureValue';severity='good';
      policy='カバー側は強いレンジでショートに圧をかけ、バリューを取り切る価値があります。';
    }
  }else if(lane==='check'){
    if(covered&&(onePair||draw)&&!strongMade&&(danger||spr>=4||opponent==='上位カバー')){
      verdict='potControl';severity='good';
      policy='FTではカバーされる側のチェックは弱さではなく、順位を守るポット管理として自然です。';
    }
  }
  return{street:d.street,lane,spr,sizePct,stackRole,opponent,covered,covering,onePair,weakPair,strongOnePair,draw,strongMade,danger,verdict,severity,policy,risk};
}
function tournamentFinalTablePostflopProfileText(p){
  if(!p)return'';
  const lane={check:'チェック',call:'コール',bet:'ベット/レイズ'}[p.lane]||p.lane;
  return p.street.toUpperCase()+' / '+lane+' / '+p.verdict+'：'+p.policy+' 注意: '+p.risk;
}
// [Codex fix 2026-06-05] FT評価の複数軸を、利用者が次に直すべき一つの学習テーマへ集約する。
function tournamentFinalTableLearningPoint(ev){
  if(!ev||ev.tournamentPhase!=='FT')return null;
  const fp=ev.finalTableProfile||null;
  const frp=ev.finalTableRangeProfile||(fp&&fp.rangeProfile)||null;
  const fpp=ev.finalTablePostflopProfile||null;
  const role=fp&&fp.stackRole||frp&&frp.role||fpp&&fpp.stackRole||'不明';
  const opponent=(fp&&fp.collisionProfile&&fp.collisionProfile.opponent)||frp&&frp.opponent||fpp&&fpp.opponent||'不明';
  let category='',title='',point='',drill='',severity='normal',priority=0;
  if(frp&&frp.lane==='callOff'&&frp.severity==='bad'){
    category='FT受けすぎ';
    title=role+'が'+opponent+'を受けるレンジを絞る';
    point='FTのオールイン受けは、必要EQより「負けた時に順位が崩れる相手か」を先に見ます。';
    drill='同じ手で Call ではなく Fold を選ぶ相手、受けてよい相手を分ける。';
    severity='bad';priority=95;
  }else if(frp&&frp.lane==='flat'&&frp.severity==='bad'){
    category='FTフラット過多';
    title=role+'の非BBフラットをreshove/foldに整理する';
    point='FTの20BB前後では、見た目のプレイアビリティより、コール後に順位を落とすSPRと衝突相手を重く見ます。';
    drill='非BBでコールしたくなった時は、先に「押し返せるか、降りるか」の2択に置き換える。';
    severity='bad';priority=88;
  }else if(fpp&&fpp.lane==='call'&&fpp.severity==='bad'){
    category='FTワンペア受け';
    title='カバーされる側のリバー/大きめコールを減らす';
    point='FTで上位/同格にカバーされる時、ワンペアや弱いSDVはchipEVより順位落ちの痛みが大きくなります。';
    drill='リバーで「相手がバリュー過多なら降りる」を先に宣言してからコール判断する。';
    severity='bad';priority=90;
  }else if(fpp&&fpp.lane==='bet'&&fpp.severity==='bad'){
    category='FTポット管理';
    title='カバーされる側で自分から大きなポットを作らない';
    point='FTではワンペア/弱いSDVから大きく打つほど、失敗時にペイジャンプを捨てる形になります。';
    drill='危険ボードではチェックまたは小サイズを第一候補に置く。';
    severity='bad';priority=82;
  }else if(frp&&frp.severity==='good'&&ev.action==='fold'&&frp.lane!=='callOff'){
    category='FT先入れ不足';
    title=role+'の先入れスポットを逃さない';
    point='FTでも待ちすぎるとアンティで順位が落ちます。特に最短ショートはフォールドエクイティが残るうちに入れます。';
    drill='後ろ寄りで先に入れる候補を、Fold前にOpen/Open jamへ置き換えて確認する。';
    severity='border';priority=78;
  }else if(fp&&fp.lane==='callOff'&&fp.collisionProfile&&(opponent==='上位カバー'||opponent==='同格')){
    category='FT衝突相手';
    title='ぶつかる相手を選ぶ';
    point='同じハンドでも、ショート相手とCL級相手では受ける価値が変わります。';
    drill='アクション前に「負けても残る相手か、飛ばされる相手か」を声に出す。';
    severity='border';priority=70;
  }else if(fpp&&fpp.lane==='check'&&fpp.severity==='good'){
    category='FTポット管理';
    title='チェックで順位を守る判断を肯定する';
    point='カバーされる側のチェックは弱さではなく、SPRと順位を守る手段です。';
    drill='危険ボードでは「打つ理由」より先に「打たない価値」を確認する。';
    severity='good';priority=52;
  }else if(fpp&&fpp.severity==='good'&&fp&&fp.stackRole==='チップリーダー'){
    category='FTカバー圧';
    title='カバー側は相手を選んで圧を使う';
    point='ショート相手にはカバー圧と強いSDVを活かせます。CL級との衝突とは別物です。';
    drill='相手がショートなら受け/バリュー、同格以上なら衝突回避を切り替える。';
    severity='good';priority=45;
  }
  if(!title)return null;
  return{phase:'FT',category,title,point,drill,severity,priority,role,opponent};
}
function tournamentFinalTableLearningPointText(p){
  if(!p)return'';
  return p.category+'：'+p.title+'。'+p.point+' 練習: '+p.drill;
}
function tournamentFinalTableProfile(ctx,d,stackBB,pos,holeCards){
  if(!ctx||!ctx.enabled||ctx.phase!=='FT'||!d)return null;
  const ht=holeCards&&holeCards.length>=2?handType(holeCards[0],holeCards[1]):'';
  const frac=HAND_COMBO_FRAC[ht]||0.99;
  const facing=!!(d.facingRaise&&(d.toCall||0)>0);
  const raiseLike=d.action==='raise'||d.action==='allin';
  const covered=d.coverState==='covered'||d.coverState==='mixed_covered';
  const covering=d.coverState==='covering'||d.coverState==='mixed_covering';
  const late=['CO','BTN','SB'].includes(pos||d.position||'');
  const callCommitRatio=d.playerChipsBefore?((d.amount||d.toCall||0)/Math.max(1,d.playerChipsBefore)):0;
  const callOff=facing&&d.action==='call'&&(callCommitRatio>=0.45||d.facingAllIn);
  const rank=d.stackRank||null;
  const shorter=d.shorterStackCount||0;
  const stackRole=tournamentFinalTableStackRole(ctx,d,stackBB);
  const collision=tournamentFinalTableCollisionProfile(ctx,d,stackRole,stackBB);
  const ftRange=tournamentFinalTableRangeProfile(ctx,d,holeCards,stackBB,pos,stackRole,collision);
  const payPressure=(ctx.playersLeft||ctx.players||6)<=Math.max((ctx.seatsPaid||3)+3,6)?'高':'中';
  let lane='postflop',severity='normal',verdict='通常',policy='FTはchipEVだけでなく、ペイジャンプと自分のスタック順位を見て衝突相手を選びます。';
  let risk='ペイジャンプをまたぐ局面では、カバーされる薄い受けが一番高くつきます。';
  let multiplier=1.0;
  if(d.street==='preflop'&&facing&&d.action==='call'){
    lane=callOff?'callOff':'flat';
    if(covered&&!covering){severity=callOff?'bad':'border';verdict=callOff?'カバーされるオールイン受け注意':'カバーされる薄いフラット注意';multiplier=callOff?1.34:1.22;}
    else if(covering){severity='border';verdict='カバー側でも受けは選別';multiplier=1.08;policy='FTでカバーしている側は攻撃価値が高い一方、受けのコールは相手の強いレンジに寄りやすいです。';}
    else{severity='border';verdict='FTのコールは相手選びが必要';multiplier=1.14;}
  }else if(d.street==='preflop'&&facing&&d.action==='fold'){
    lane='fold';
    severity='good';verdict='ペイジャンプを守るフォールド';multiplier=0.82;
    policy='FTでは、薄い受けを降りること自体が正しい利益になる局面があります。';
  }else if(d.street==='preflop'&&raiseLike&&!facing){
    lane=d.action==='allin'?'openJam':'open';
    if(covering&&late){severity='good';verdict='カバー側の圧力';multiplier=0.90;policy='カバーしている後ろ寄りポジションは、ペイジャンプ圧を使って広めに攻められます。';}
    else if(covered&&frac>0.34){severity='border';verdict='カバーされる下限攻撃';multiplier=1.12;policy='カバーされている側の下限オープン/Jamは、失敗時の脱落リスクを少し重く見ます。';}
    else{severity='normal';verdict='FT標準攻撃';multiplier=1.0;}
  }else if(d.street==='preflop'&&d.action==='fold'&&!facing&&late&&frac<=0.42){
    lane='missedSteal';severity='border';verdict='スチール機会を逃し気味';multiplier=1.12;
    risk='FTでも降りすぎると、ブラインド/アンティでスタック順位が落ち、次のペイジャンプで苦しくなります。';
  }else if(d.street!=='preflop'&&d.toCall>0&&d.action==='call'){
    lane='postflopCall';
    severity=covered?'border':'normal';verdict=covered?'カバーされるポストフロップ受け注意':'ポストフロップ受け';
    multiplier=covered?1.12:1.04;
  }
  if(stackRole){
    if(lane==='callOff'||lane==='flat')multiplier*=stackRole.callMultiplier;
    else if(lane==='fold')multiplier*=stackRole.foldMultiplier;
    else if(lane==='open'||lane==='openJam')multiplier*=stackRole.attackMultiplier;
    else if(lane==='missedSteal')multiplier*=stackRole.missedStealMultiplier;
    else if(lane==='postflopCall')multiplier*=stackRole.postflopCallMultiplier;
    policy=policy+' '+stackRole.policy;
    risk=risk+' '+stackRole.risk;
  }
  if(collision){
    if(lane==='callOff'||lane==='flat')multiplier*=collision.callMultiplier;
    else if(lane==='fold')multiplier*=collision.foldMultiplier;
    else if(lane==='open'||lane==='openJam')multiplier*=collision.attackMultiplier;
    else if(lane==='postflopCall')multiplier*=collision.postflopCallMultiplier;
    policy=policy+' '+collision.policy;
    risk=risk+' '+collision.risk;
  }
  return{
    phase:'FT',lane,severity,verdict,policy,risk,multiplier,
    payPressure,stackRank:rank,shorterStackCount:shorter,coverState:d.coverState||'neutral',
    stackRole:stackRole?stackRole.role:null,stackRoleProfile:stackRole,collisionProfile:collision,rangeProfile:ftRange,
    deepAxes:[
      '立場='+(stackRole?stackRole.role:'不明'),
      '衝突相手='+(collision?collision.opponent:'不明'),
      'ペイジャンプ圧='+payPressure,
      'スタック順位='+(rank!=null?rank:'不明'),
      '下位スタック='+shorter+'人',
      'カバー関係='+(d.coverLabel||'中立'),
      '攻め/受け='+(lane||'')
    ]
  };
}
function tournamentFinalTableProfileText(p){
  if(!p)return'';
  return (p.stackRole?p.stackRole+' / ':'')+p.verdict+' / '+p.policy;
}
// [Codex fix 2026-06-05] HUはICMよりレンジ幅・主導権・BB防衛を優先して評価する。
function tournamentHeadsUpProfile(ctx,d,stackBB,pos,holeCards){
  if(!ctx||!ctx.enabled||ctx.phase!=='HU'||!d)return null;
  const ht=holeCards&&holeCards.length>=2?handType(holeCards[0],holeCards[1]):'';
  const frac=HAND_COMBO_FRAC[ht]||0.99;
  const c1=holeCards&&holeCards[0],c2=holeCards&&holeCards[1];
  const suited=!!(c1&&c2&&c1.suit===c2.suit),pair=!!(c1&&c2&&c1.rank===c2.rank);
  const r1=c1?RANK_VAL[c1.rank]||0:0,r2=c2?RANK_VAL[c2.rank]||0:0;
  const hi=Math.max(r1,r2),lo=Math.min(r1,r2),gap=hi-lo;
  const playable=pair||suited||hi>=11||gap<=4||frac<=0.72;
  const strongDefend=pair||suited||hi>=12||gap<=2||frac<=0.46;
  const facing=!!(d.facingRaise&&(d.toCall||0)>0);
  const sb=(pos==='BTN'||pos==='SB');
  const bb=pos==='BB';
  const pot=Math.max(1,d.pot||0);
  const sizePct=d.amount?Math.round((d.amount||0)/pot*100):0;
  let lane='postflop',severity='normal',verdict='HU標準',policy='HUではレンジが大きく広がり、降りすぎるとブラインドだけで削られます。';
  let risk='リングやフルリングの感覚で待ちすぎると、HUでは参加頻度不足になります。';
  let multiplier=1.0;
  if(d.street==='preflop'&&!facing&&d.action==='fold'&&sb){
    lane='sbFold';
    severity=playable?'bad':'border';
    verdict=playable?'SB/BTNの降りすぎ':'SB/BTNフォールド下限';
    multiplier=playable?1.38:1.12;
    policy='HUのSB/BTNは非常に広く参加します。弱すぎる手以外は、レイズ・リンプ・一部jamで先に主導権を取りに行きます。';
  }else if(d.street==='preflop'&&!facing&&d.action==='call'&&sb){
    lane='sbLimp';
    severity=playable?'good':'border';
    verdict=playable?'SB/BTNリンプ混合':'弱いSB/BTNリンプ';
    multiplier=playable?0.90:1.06;
    policy='HUのSB/BTNリンプは逃げではなく混合戦略です。相手が3bet/押し返し過多なら、リンプでポットを制御する価値があります。';
  }else if(d.street==='preflop'&&!facing&&(d.action==='raise'||d.action==='allin')&&sb){
    lane=d.action==='allin'?'sbJam':'sbOpen';
    severity=playable?'good':'border';
    verdict=d.action==='allin'?'SB/BTNの先入れjam':'SB/BTNの主導権オープン';
    multiplier=playable?0.84:1.06;
    policy='HUのSB/BTNはレイズ中心で広く参加します。小さめオープンでBBに圧をかけ、降りすぎを許しません。';
  }else if(d.street==='preflop'&&facing&&bb&&d.action==='fold'){
    lane='bbFold';
    severity=playable?'bad':'border';
    verdict=playable?'BB防衛の降りすぎ':'BB防衛下限フォールド';
    multiplier=playable?1.32:1.08;
    risk='HUのBBは相手SBレンジが広いため、フルリングよりかなり広く守ります。';
  }else if(d.street==='preflop'&&facing&&bb&&d.action==='call'){
    lane='bbDefend';
    severity=playable?'good':'border';
    verdict=playable?'BB防衛として自然':'弱いBB防衛';
    multiplier=playable?0.88:1.06;
    policy='HUのBBコールは広くて自然です。ただし弱いオフスーツは、コール後の実現率が落ちます。';
  }else if(d.street==='preflop'&&facing&&bb&&(d.action==='raise'||d.action==='allin')){
    lane='bb3bet';
    severity=strongDefend?'good':'border';
    verdict=d.action==='allin'?'BBの押し返しjam':'BBの3bet圧';
    multiplier=strongDefend?0.88:1.08;
    policy='HUのBBはコールだけでなく、ペア・強いスーテッド・ブロッカーで押し返す頻度も必要です。';
  }else if(d.street!=='preflop'&&(d.action==='raise'||d.action==='allin')&&d.toCall===0){
    lane=sizePct<=45?'postflopSmallBet':sizePct>=90?'postflopBigBet':'postflopBet';
    severity=sizePct<=45?'good':'normal';
    verdict=sizePct<=45?'HU小ベットで主導権':'HUポストフロップベット';
    multiplier=sizePct<=45?0.90:0.98;
    policy='HUのポストフロップは小さなベットで広いレンジを押し、薄いバリューとプロテクションを取りに行く頻度が増えます。';
  }else if(d.street!=='preflop'&&d.action==='check'&&d.toCall===0){
    lane='postflopCheck';
    severity='border';verdict='HUの受け身チェック';
    multiplier=1.08;
    policy='HUでは小ベットで主導権を取り返す頻度が増えますが、SDVのあるチェックも混ざります。';
  }else if(d.street!=='preflop'&&d.toCall>0&&d.action==='fold'){
    lane='postflopFold';
    severity='border';verdict='ポストフロップ降りすぎ注意';
    multiplier=1.14;
  }else if(d.street!=='preflop'&&d.toCall>0&&d.action==='call'){
    lane='postflopCall';
    severity='normal';verdict='HUの広い受け';
    multiplier=0.94;
  }
  return{
    phase:'HU',lane,severity,verdict,policy,risk,multiplier,
    playable,strongDefend,handFrac:Math.round(frac*100),position:pos,stackBB,sizePct,
    deepAxes:[
      'SB参加頻度=レイズ中心+リンプ混合',
      'BB防衛=広いが弱オフは選別',
      '3bet/押し返し=ペア/スーテッド/ブロッカー',
      'ポストフロップ=小ベットと薄い受けが増加',
      'ICM圧=低'
    ]
  };
}
function tournamentHeadsUpProfileText(p){
  if(!p)return'';
  return p.verdict+' / '+p.policy;
}
// [Codex fix 2026-06-05] HUリバーは広いレンジを理由に、薄いワンペア受け/大きすぎる薄バリューを雑に正当化しない。
function tournamentHeadsUpRiverProfile(ctx,hr,d,role,tex,stackBB,pos){
  if(!ctx||!ctx.enabled||ctx.phase!=='HU'||!d||d.street!=='river'||!role)return null;
  const lane=d.action==='check'?'check':d.action==='call'?'call':(d.action==='raise'||d.action==='bet'||d.action==='allin')?'bet':d.action;
  const basePot=lane==='call'?Math.max(1,(d.pot||0)-(d.toCall||0)):Math.max(1,d.pot||1);
  const sizePct=lane==='call'?Math.round((d.toCall||d.amount||0)/basePot*100):(d.pot?Math.round((d.amount||0)/Math.max(1,d.pot)*100):0);
  const pairTier=role.pairTier||'';
  const note=role.note||'';
  const onePair=!!pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(note);
  const strongOnePair=['top_pair','overpair'].includes(pairTier)&&(role.role==='strong'||role.role==='value');
  const weakShowdown=onePair&&!strongOnePair;
  const strongMade=!!(role.isNut||role.role==='nutted'||(!onePair&&(role.role==='strong'||role.role==='value')));
  const danger=!!(tex&&(tex.flushy>=3||tex.paired||tex.straightDraw||tex.dynamic));
  const idx=streetDecisionIndex(hr,d);
  const before=idx>=0?hr.decisions.slice(0,idx):hr.decisions;
  const villainBets=before.filter(function(x){return !x.isHuman&&(x.action==='raise'||x.action==='bet'||x.action==='allin')&&(x.street==='flop'||x.street==='turn'||x.street==='river');}).length;
  let verdict='normal';
  let severity='normal';
  let policy='HUのリバーはレンジが広いため、薄いバリューとブラフキャッチが増えます。ただしサイズと完成ボードで分けます。';
  let risk='サイズ'+sizePct+'%pot / '+(danger?'完成・動的ボード':'比較的静的')+' / 相手圧力'+villainBets+'回';
  if(lane==='call'){
    if((weakShowdown&&sizePct>=45)||(onePair&&sizePct>=75)||(onePair&&danger&&sizePct>=55&&villainBets>=1)){
      verdict='thinCatch';
      severity=(weakShowdown||sizePct>=75)?'bad':'border';
      policy='HUでもリバーの大きいベットにワンペアで自動コールしません。相手のバリュー密度とブロッカーを見て、受けすぎを防ぎます。';
    }else if(strongOnePair&&sizePct>=45&&(danger||villainBets>=1)){
      verdict='bluffCatch';
      severity='border';
      policy='強いトップペアでも、HUリバーの中〜大サイズは明確コールではなくブラフキャッチです。相手傾向でCall/Foldを混ぜます。';
    }else if(strongMade){
      verdict='valueCall';
      severity='good';
      policy='強いメイドハンドはHUの広いベットレンジに対して受ける価値があります。';
    }
  }else if(lane==='bet'){
    if(onePair&&sizePct>=80&&(danger||!strongOnePair)){
      verdict='thinValueOverdo';
      severity='bad';
      policy='HUでもワンペアの大きすぎる薄バリューは、悪いレンジだけにコールされやすく危険です。小〜中サイズへ落とします。';
    }else if(onePair&&sizePct<=55){
      verdict='thinValue';
      severity='good';
      policy='HUでは強いワンペアの小〜中サイズ薄バリューが重要です。チェックだけに寄せず、コールされる下のレンジを残します。';
    }else if(role.role==='air'&&sizePct<=70){
      verdict='riverStab';
      severity='border';
      policy='HUではリバーのブラフ頻度も必要ですが、相手がコール寄りなら無理に増やしません。';
    }
  }else if(lane==='check'){
    if(onePair&&(danger||!strongOnePair)){
      verdict='potControl';
      severity='good';
      policy='危険ボードや弱めのワンペアは、HUでもチェックでショーダウン価値を守る判断が自然です。';
    }else if(strongOnePair&&!danger){
      verdict='missedThinValue';
      severity='border';
      policy='クリーン寄りのHUリバーでは、強いトップペアは小さめ薄バリューも候補です。';
    }
  }else if(lane==='fold'){
    if(onePair&&sizePct>=70&&(danger||villainBets>=1)){
      verdict='disciplinedFold';
      severity='good';
      policy='HUでも大サイズ・完成ボード・相手圧力が揃うワンペアは降りられることが利益になります。';
    }else if(strongOnePair&&sizePct<=45&&!danger){
      verdict='overFold';
      severity='bad';
      policy='HUの小〜中サイズに強いトップペアを降りすぎると、相手のブラフを許しすぎます。';
    }
  }
  return{phase:'HU',lane,sizePct,onePair,strongOnePair,weakShowdown,strongMade,danger,villainBets,verdict,severity,policy,risk,position:pos,stackBB};
}
function tournamentHeadsUpRiverProfileText(p){
  if(!p)return'';
  const lane={check:'チェック',call:'コール',bet:'ベット/レイズ',fold:'フォールド'}[p.lane]||p.lane;
  return 'RIVER / '+lane+' / '+p.verdict+'：'+p.policy+' 注意: '+p.risk;
}
// [Codex fix 2026-06-03] バブル付近は単なるICM高ではなく、スタック立場とカバー関係で評価軸を分ける。
function tournamentBubbleProfile(ctx,d,stackBB,pos){
  if(!ctx||!ctx.enabled||!d)return null;
  const axes=tournamentEvalAxes(ctx,stackBB);
  const left=ctx.playersLeft||0,paid=ctx.seatsPaid||0;
  const bubbleish=ctx.phase==='バブル'||ctx.focusId==='bubble_call'||axes.icmPressure==='高';
  if(!bubbleish)return null;
  const bb=stackBB||ctx.stackBB||25;
  const avg=ctx.avgStackBB||ctx.stackBB||bb||20;
  const coverState=d.coverState||'neutral';
  const covered=coverState==='covered'||coverState==='mixed_covered';
  const covering=coverState==='covering'||coverState==='mixed_covering';
  const coverCount=d.coverCount||0;
  const coveredByCount=d.coveredByCount||0;
  const bubbleDistance=left&&paid?Math.max(0,left-paid):null;
  const shorterExists=coverCount>0;
  let stage='バブル付近';
  if(left&&paid){
    if(left<=paid+1)stage='直接バブル';
    else if(left<=paid+3)stage='バブル目前';
    else if(left<=paid*2.2)stage='準バブル';
  }
  let stackRole='ミドル';
  if(bb<=8||bb<=avg*0.45)stackRole='危険ショート';
  else if(bb>=avg*1.45)stackRole='ビッグ';
  else if(bb>=avg*1.12)stackRole='上位ミドル';
  else if(bb<=14||bb<=avg*0.75)stackRole='ショート';
  let leverage='同程度';
  if(covered)leverage='カバーされている';
  else if(covering)leverage='カバーしている';
  let archetype=stackRole+' / '+leverage;
  let risk='薄い衝突回避';
  let policy='Callを締め、Open/reshoveは相手とカバー関係を選ぶ';
  let callMultiplier=1.25,foldMultiplier=0.82,attackMultiplier=1.0;
  if(covered&&stackRole==='ミドル'){
    archetype='カバーされているミドル';
    risk='ミドル同士の衝突で即終了';
    policy='薄いCallを大きく締め、強い手はjam/foldへ整理';
    callMultiplier=1.55;foldMultiplier=0.60;attackMultiplier=1.20;
  }else if(covered&&stackRole==='上位ミドル'){
    archetype='カバーされている上位ミドル';
    risk='上位スタックを守れず転落';
    policy='大きなポットを受けない。攻める相手は自分がカバーできる相手を優先';
    callMultiplier=1.45;foldMultiplier=0.66;attackMultiplier=1.18;
  }else if(covered&&(stackRole==='ショート'||stackRole==='危険ショート')){
    archetype='カバーされているショート';
    risk='生存かダブルアップかの押し引き';
    policy='受け身のCallより、押せるハンドは先にオールイン';
    callMultiplier=1.28;foldMultiplier=0.75;attackMultiplier=1.05;
  }else if(covering&&stackRole==='ビッグ'){
    archetype='カバーしているビッグ';
    risk='圧をかける機会損失';
    policy='Open/reshoveで圧をかける。Callで受けるより主導権を取る';
    callMultiplier=1.08;foldMultiplier=1.00;attackMultiplier=0.86;
  }else if(covering){
    archetype='カバーしている側';
    risk='圧をかける相手選び';
    policy='攻撃は許容されやすいが、受けのCallはまだ慎重';
    callMultiplier=1.12;foldMultiplier=0.90;attackMultiplier=0.92;
  }else if(stackRole==='ミドル'||stackRole==='上位ミドル'){
    archetype='ミドル同士';
    risk='ぶつかってはいけないミドル衝突';
    policy='薄いCallを避け、ショートがいる時は自滅を避ける';
    callMultiplier=1.38;foldMultiplier=0.68;attackMultiplier=1.08;
  }else if(stackRole==='危険ショート'||stackRole==='ショート'){
    archetype='生存優先ショート';
    risk='ブラインドで削られる前のpush/fold';
    policy='Callで見るよりpush/fold。降りすぎも残りBBと相談';
    callMultiplier=1.18;foldMultiplier=0.88;attackMultiplier=0.96;
  }
  if(shorterExists&&(stackRole==='ミドル'||stackRole==='上位ミドル')&&!covering){
    risk='自分より短いスタックがいる中でのミドル衝突';
    policy+='。下位スタックがいる間は、受けるオールインと非BBフラットをさらに締める';
    callMultiplier+=0.18;
    foldMultiplier=Math.max(0.52,foldMultiplier-0.08);
  }
  if(stage==='直接バブル'){
    callMultiplier+=0.08;
    foldMultiplier=Math.max(0.50,foldMultiplier-0.04);
  }
  return{
    stage,stackRole,leverage,archetype,risk,policy,
    callMultiplier,foldMultiplier,attackMultiplier,
    left,paid,bubbleDistance,avgStackBB:avg,stackBB:bb,position:pos||d.position||'',
    coverCount,coveredByCount,shorterExists
  };
}
function tournamentBubbleProfileText(profile){
  if(!profile)return'';
  const dist=profile.bubbleDistance!=null?' / 通過まで'+profile.bubbleDistance+'人':'';
  const shorter=profile.coverCount?' / 下位スタック'+profile.coverCount+'人':'';
  return profile.stage+dist+shorter+' / '+profile.archetype+' / 危険: '+profile.risk+' / 方針: '+profile.policy;
}
// [Codex fix 2026-06-03] バブル用の簡易ICMレンジ表。押す側と受ける側を明確に分ける。
function tournamentBubbleIcmRangeProfile(ctx,d,holeCards,stackBB,pos,bubbleProfile){
  if(!ctx||!ctx.enabled||!d||!holeCards||holeCards.length<2)return null;
  const bp=bubbleProfile||tournamentBubbleProfile(ctx,d,stackBB,pos);
  if(!bp)return null;
  const ht=handType(holeCards[0],holeCards[1]);
  const handFrac=HAND_COMBO_FRAC[ht]||0.99;
  const pct=Math.round(handFrac*100);
  const facing=!!(d.facingRaise&&(d.toCall||0)>0);
  const raiseLike=d.action==='raise'||d.action==='allin';
  const callCommitRatio=d.playerChipsBefore?((d.amount||d.toCall||0)/Math.max(1,d.playerChipsBefore)):0;
  const callOff=facing&&(d.action==='call'||d.action==='fold')&&(callCommitRatio>=0.55||((d.toCall||0)>=Math.max(1,(d.playerChipsBefore||0)*0.55)));
  const nonBBFlat=facing&&(d.action==='call'||d.action==='fold')&&pos!=='BB'&&!callOff;
  const group=['CO','BTN','SB'].includes(pos)?'late':['HJ','LJ','MP'].includes(pos)?'mp':pos==='BB'?'bb':'ep';
  let lane='open';
  if(callOff)lane='callOff';
  else if(nonBBFlat)lane='flat';
  else if(facing&&raiseLike)lane='reshove';
  else if(!facing&&d.action==='allin')lane='openJam';
  else if(!facing&&(d.action==='raise'||d.action==='fold'))lane='open';
  else if(facing&&pos==='BB')lane='bbDefend';
  const table={
    callOff:{ep:4,mp:5,late:7,bb:9},
    flat:{ep:3,mp:4,late:6,bb:18},
    reshove:{ep:8,mp:12,late:18,bb:20},
    openJam:{ep:10,mp:15,late:26,bb:0},
    open:{ep:16,mp:22,late:34,bb:0},
    bbDefend:{ep:18,mp:24,late:34,bb:38}
  };
  let cap=(table[lane]&&table[lane][group])||10;
  if(bp.archetype==='カバーされているミドル'||bp.archetype==='カバーされている上位ミドル'){
    if(lane==='callOff')cap-=2;
    if(lane==='flat')cap-=2;
    if(lane==='openJam'||lane==='reshove')cap-=1;
  }else if(bp.archetype==='カバーしているビッグ'){
    if(lane==='openJam'||lane==='reshove'||lane==='open')cap+=5;
    if(lane==='callOff')cap+=1;
  }else if(bp.archetype==='生存優先ショート'||bp.archetype==='カバーされているショート'){
    if(lane==='openJam'||lane==='reshove')cap+=3;
    if(lane==='flat')cap-=2;
  }else if(bp.shorterExists&&(lane==='callOff'||lane==='flat')){
    cap-=2;
  }
  if(bp.stage==='直接バブル'&&(lane==='callOff'||lane==='flat'))cap-=1;
  cap=Math.max(1,Math.min(45,cap));
  const margin=cap-pct;
  let verdict='レンジ内';
  let severity='good';
  if(margin<0&&pct<=cap+4){verdict='境界';severity='border';}
  else if(margin<0){verdict='レンジ外';severity='bad';}
  const laneLabel={callOff:'All-in Call',flat:'Flat Call',reshove:'Reshove',openJam:'Open Jam',open:'Open',bbDefend:'BB Defend'}[lane]||lane;
  const note=lane==='callOff'
    ?'受ける側は押す側よりかなり狭い'
    :lane==='openJam'||lane==='reshove'
      ?'押す側はフォールドエクイティ込みで少し広く取れる'
      :lane==='flat'
        ?'バブルの非BBフラットはかなり狭い'
        :'バブル立場とポジションで下限を調整';
  return{handType:ht,handPercent:pct,lane,laneLabel,capPercent:cap,marginPercent:margin,verdict,severity,note};
}
function tournamentBubbleIcmRangeText(profile){
  if(!profile)return'';
  return profile.handType+' 上位'+profile.handPercent+'% / '+profile.laneLabel+'目安 上位'+profile.capPercent+'% -> '+profile.verdict+'。'+profile.note;
}
// [Codex fix 2026-06-04] 中盤評価を5軸（サイズ/BBアンティ/reshove/flat/低SPR）で読めるようにする。
function tournamentMiddleHandShape(holeCards){
  if(!holeCards||holeCards.length<2)return{label:'',risk:'',boost:0};
  const c1=holeCards[0],c2=holeCards[1];
  const r1=RANK_VAL[c1.rank]||0,r2=RANK_VAL[c2.rank]||0;
  const hi=Math.max(r1,r2),lo=Math.min(r1,r2),gap=hi-lo;
  const suited=c1.suit===c2.suit,pair=r1===r2;
  if(pair)return{label:hi>=12?'プレミアムペア':hi>=8?'中ペア':'小ペア',risk:hi>=8?'reshove/セット価値':'セットマインだけで受けすぎ注意',boost:hi>=8?-0.04:0.02};
  if(!suited&&hi>=10&&lo>=9&&gap<=3)return{label:'ドミネートされやすいオフスーツ',risk:'トップペアでキッカー負けしやすい',boost:0.10};
  if(!suited&&hi===14&&lo<=9)return{label:'弱Aオフスーツ',risk:'Aヒット時も支配されやすい',boost:0.08};
  if(suited&&hi===14)return{label:'スーテッドA',risk:'ブロッカーとナッツFD価値あり',boost:-0.03};
  if(suited&&gap<=2)return{label:'スーテッド連結',risk:'BB防衛向きだが非BB flatは深さ依存',boost:-0.02};
  if(hi>=12&&lo>=10)return{label:'ブロードウェイ',risk:'参加可だが位置と主導権が重要',boost:0.02};
  return{label:suited?'スーテッド周辺':'その他',risk:suited?'実現率は位置依存':'実現率が低くなりやすい',boost:suited?0.00:0.04};
}
// [Codex fix 2026-06-03] 中盤はスタック帯ごとにopen/open jam/reshove/flat/BB防衛の役割を分ける。
function tournamentMiddleProfile(ctx,d,stackBB,pos,holeCards){
  if(!ctx||!ctx.enabled||!d)return null;
  const axes=tournamentEvalAxes(ctx,stackBB);
  const bb=stackBB||ctx.stackBB||25;
  const middleish=ctx.phase==='中盤'||(bb<=25&&ctx.phase!=='バブル'&&ctx.phase!=='HU'&&axes.icmPressure!=='高');
  if(!middleish||bb>25)return null;
  const facing=!!(d.facingRaise&&(d.toCall||0)>0);
  const raiseLike=d.action==='raise'||d.action==='allin';
  const committed=(d.action==='allin')||((d.amount||0)>=Math.max((d.playerChipsBefore||0)*0.65,(ctx.bb||1)*10));
  let lane='open';
  if(facing&&pos==='BB'&&!raiseLike)lane='bbDefend';
  else if(facing&&raiseLike)lane='reshove';
  else if(facing&&d.action==='call')lane='flat';
  else if(facing&&d.action==='fold')lane='vsRaiseFold';
  else if(!facing&&committed)lane='openJam';
  else if(!facing&&(d.action==='raise'||d.action==='fold'))lane='open';
  let band='18〜25BB reshove帯';
  let risk='非BBフラットでSPRが浅い難問になる';
  let policy='小さめopen、非BB flat削減、3bet jam/reshove候補を整理';
  let flatMultiplier=1.24,callMultiplier=1.08,attackMultiplier=1.06,foldMultiplier=1.0;
  let targetOpen='2.1〜2.3BB';
  if(bb<=10){
    band='10BB以下 純push/fold';
    risk='通常openやcallで残りSPRを作る余裕がない';
    policy='open jam/foldを主軸にし、call参加をほぼ消す';
    flatMultiplier=1.45;callMultiplier=1.22;attackMultiplier=0.98;foldMultiplier=1.04;targetOpen='open jam中心';
  }else if(bb<=14){
    band='11〜14BB open jam混合';
    risk='小さくopenして3bet jamを受けると判断が難しい';
    policy='後ろ寄りはopen jamを混ぜ、前寄りは小さめopen/foldを整理';
    flatMultiplier=1.38;callMultiplier=1.16;attackMultiplier=1.00;foldMultiplier=1.02;targetOpen='2.0〜2.1BBまたはopen jam';
  }else if(bb<=17){
    band='15〜17BB reshove帯';
    risk='受け身のcallでフォールドエクイティを失う';
    policy='openは小さく、対openはcallよりreshove/foldで整理';
    flatMultiplier=1.32;callMultiplier=1.12;attackMultiplier=1.02;foldMultiplier=1.0;targetOpen='2.0〜2.2BB';
  }else{
    band='18〜25BB resteal帯';
    risk='非BBフラットと大きすぎるopenで3bet jam耐性が落ちる';
    policy='2.1〜2.3BB open、BB defendは広め、非BBはflatより3bet jam/fold';
    flatMultiplier=1.24;callMultiplier=1.08;attackMultiplier=1.06;foldMultiplier=1.0;targetOpen='2.1〜2.3BB';
  }
  if(lane==='flat')risk='中盤の非BBフラットでSPRが浅い難問になる';
  else if(lane==='bbDefend')risk='BBは守れるが、ヒット後の払いすぎが危険';
  else if(lane==='reshove')risk='押し返し候補の選別とフォールドエクイティ';
  else if(lane==='openJam')risk='open jam下限と後続人数の見落とし';
  else if(lane==='open')risk='openサイズと3bet jam耐性';
  const ht=holeCards&&holeCards.length>=2?handType(holeCards[0],holeCards[1]):'';
  const handPercent=ht?Math.round((HAND_COMBO_FRAC[ht]||0.99)*100):null;
  const bbSize=ctx.bb||ctx.bigBlind||ctx.BB||1;
  const openSizeBB=(!facing&&d.action==='raise'&&bbSize)?Math.round((d.amount||0)/bbSize*10)/10:null;
  let openSizeVerdict='';
  if(openSizeBB){
    if(openSizeBB<1.9)openSizeVerdict='小さすぎ';
    else if(openSizeBB<=2.4)openSizeVerdict='適正';
    else if(openSizeBB<=2.8)openSizeVerdict='やや大きい';
    else openSizeVerdict='大きすぎ';
  }
  const anteBB=ctx.bbAnteBB||0;
  const initialPotBB=Math.round((1.5+anteBB)*10)/10;
  const antePressure=anteBB>=1?'高':anteBB>=0.5?'中':'低';
  const shape=tournamentMiddleHandShape(holeCards);
  if(lane==='flat'&&shape.boost>0)flatMultiplier+=shape.boost;
  if(lane==='flat'&&shape.boost<0)flatMultiplier=Math.max(1.10,flatMultiplier+shape.boost);
  if(lane==='open'&&openSizeVerdict==='大きすぎ')attackMultiplier+=0.08;
  if(lane==='open'&&openSizeVerdict==='やや大きい')attackMultiplier+=0.04;
  if(lane==='openJam'&&['CO','BTN','SB'].includes(pos||d.position||''))attackMultiplier=Math.max(0.92,attackMultiplier-0.04);
  const postflopSPR=d.street&&d.street!=='preflop'?Math.round(((d.playerChipsBefore||0)/Math.max(1,d.pot||1))*10)/10:null;
  const deepAxes=[
    '1. openサイズ='+targetOpen+(openSizeBB?'（実際'+openSizeBB+'BB/'+openSizeVerdict+'）':''),
    '2. BBアンティ圧='+antePressure+'（初期Pot約'+initialPotBB+'BB）',
    '3. 押し返し='+((bb<=17||lane==='reshove')?'reshove/fold優先':'resteal候補を確認'),
    '4. flat罠='+(lane==='flat'?shape.label+'は'+shape.risk:'非BB flatを増やしすぎない'),
    '5. 低SPR='+(postflopSPR!=null?'SPR約'+postflopSPR:'参加前から後続SPRを想定')
  ];
  return{band,lane,risk,policy,targetOpen,stackBB:bb,position:pos||d.position||'',handType:ht,handPercent,flatMultiplier,callMultiplier,attackMultiplier,foldMultiplier,openSizeBB,openSizeVerdict,antePressure,initialPotBB,handShape:shape.label,shapeRisk:shape.risk,postflopSPR,deepAxes};
}
function tournamentMiddleProfileText(profile){
  if(!profile)return'';
  const hand=profile.handType?profile.handType+'（上位'+profile.handPercent+'%目安）':'この手';
  const bandText=profile.stackBB?('有効'+Math.round(profile.stackBB)+'BB前後'):(profile.band||'中盤');
  let laneText='参加判断';
  if(profile.lane==='bbDefend')laneText='BBでレイズを受ける場面';
  else if(profile.lane==='flat')laneText='BB以外でレイズにコールする場面';
  else if(profile.lane==='reshove')laneText='レイズに押し返す場面';
  else if(profile.lane==='openJam')laneText='先にオールインを混ぜる場面';
  else if(profile.lane==='open')laneText='自分からオープンする場面';
  else if(profile.lane==='vsRaiseFold')laneText='レイズを受けて続けるか降りるかの場面';
  let point='';
  if(profile.lane==='bbDefend')point='BBはアンティ込みで価格が良いので広く守れます。ただし当たった後に弱いワンペアで払いすぎないことが条件です。';
  else if(profile.lane==='flat')point='この深さでBB以外からコールすると、後ろから押し返されやすく、フロップ後もSPRが浅くなります。コールよりフォールドか3ベットオールイン寄りに整理します。';
  else if(profile.lane==='reshove')point='コールで受け身に残るより、フォールドエクイティを使って押し返せるかを先に見ます。';
  else if(profile.lane==='openJam')point='小さく開くより、先にオールインして後ろのプレイヤーへ最大圧をかける候補があります。';
  else point='オープンするなら小さめで十分です。大きくしすぎると、3ベットオールインを受けた時に苦しくなります。';
  return bandText+'、'+laneText+'です。'+hand+'。'+point+' 目安サイズは'+profile.targetOpen+'です。';
}
// [Codex fix 2026-05-27] Tモードのリザルトで「なぜその軸で見るのか」を初心者向けに説明する。
function tournamentResultLesson(ctx,d,stackBB,pos){
  if(!ctx||!ctx.enabled||!d)return'';
  const axes=tournamentEvalAxes(ctx,stackBB);
  const bp=tournamentBubbleProfile(ctx,d,stackBB,pos);
  const mp=tournamentMiddleProfile(ctx,d,stackBB,pos,null);
  const action=d.action;
  const facing=!!(d.facingRaise&&(d.toCall||0)>0);
  const bubble=axes.icmPressure==='高';
  const bb=stackBB||ctx.stackBB||25;
  const focusLead=ctx.focusLabel&&ctx.focusId!=='general'?'今回のテーマは「'+ctx.focusLabel+'」。':'';
  const covered=d.coverState==='covered'||d.coverState==='mixed_covered';
  const covering=d.coverState==='covering'||d.coverState==='mixed_covering';
  const coverLead=covered?'あなたをカバーする相手が残っているため、負けた時の脱落リスクを重く見ます。':covering?'あなたが相手をカバーしているため、相手にICM圧をかけやすい立場です。':'';
  const bubbleLead=bp?'【バブル立場】'+bp.archetype+'。'+bp.policy+'。':'';
  const middleLead=mp?'【中盤帯】'+mp.band+'。'+mp.policy+'。':'';
  const ft=tournamentFinalTableProfile(ctx,d,bb,pos,null);
  const hu=tournamentHeadsUpProfile(ctx,d,bb,pos,null);
  const ftLead=ft?'【FT】'+ft.verdict+'。'+ft.policy+'。':'';
  const huLead=hu?'【HU】'+hu.verdict+'。'+hu.policy+'。':'';
  if(d.street!=='preflop'){
    if(ctx.phase==='HU')return focusLead+huLead+'HUのポストフロップはレンジが広く、薄いバリュー・小ベット・ブラフキャッチ頻度が増えます。フルリング感覚で降りすぎないことが重要です。';
    if(ctx.phase==='FT')return focusLead+coverLead+ftLead+'FTのポストフロップは、ペイジャンプとスタック順位を見て、ワンペアで大きく受けすぎないことが重要です。';
    if(bb<=25)return focusLead+coverLead+bubbleLead+middleLead+'有効スタックが浅いトーナメントでは、ポストフロップのワンペア判断もプリフロップの参加レンジに強く左右されます。弱いレンジで入るほど、後で降りにくい難問が増えます。';
    return focusLead+coverLead+'トーナメントではチップを増やす価値と失う痛みが常に同じではありません。特に通過枠が近いほど、薄いバリュー取りや薄いブラフキャッチは慎重に見ます。';
  }
  if(ctx.phase==='HU'){
    return focusLead+huLead+'HUはSB/BTNが非常に広く参加し、BBも広く守ります。待ちすぎより、ポジションと主導権で小さく稼ぐ感覚を重視します。';
  }
  if(ctx.phase==='FT'){
    return focusLead+coverLead+ftLead+'FTは「勝てそう」だけでなく、負けた時の順位落ちとペイジャンプを見ます。カバー側は攻め、カバーされる側は薄い受けを避けます。';
  }
  if(action==='call'&&facing&&pos!=='BB'&&bb<=20){
    return focusLead+coverLead+bubbleLead+middleLead+'この深さの非BBコールは「安く見える参加」ではなく、SPRが浅いまま難しいフロップへ行く選択です。押し返せる手はjam、押せない手はfoldに寄せると判断が整理されます。';
  }
  if(action==='call'&&facing&&pos==='BB'){
    return focusLead+'BBはアンティ込みでポットオッズが良く、リングより広く守れます。ただし「安いから全部見る」ではなく、スーテッド性・連結性・ペア価値がない手は、ヒット後に払いすぎる危険を重く見ます。';
  }
  if((action==='raise'||action==='allin')&&facing&&bb<=20){
    return focusLead+'reshoveは単なる強気プレーではなく、フォールドエクイティを先に使って、コール後の低い実現率を避けるショートスタック戦略です。相手のオープン位置が早いほど下限は締めます。';
  }
  if(action==='allin'&&!facing&&bb<=14){
    return focusLead+coverLead+'open jamは「怖いから全部入れる」ではなく、BBアンティで大きくなった初期ポットを取り切り、3bet jamを受ける難しさを消す選択です。後ろ寄りポジションほど価値が上がります。';
  }
  if((action==='raise'||action==='allin')&&!facing&&bb<=25){
    return focusLead+'BBアンティ環境では初期ポットが大きいので、浅いスタックでは2.0〜2.3BBの小さめオープンで十分です。大きく開けるほど、jamで返された時の損失が増えます。';
  }
  if(action==='fold'&&facing&&bb<=20){
    return bubble
      ?focusLead+coverLead+bubbleLead+'バブル/チケット目前では、勝てるかだけでなく「負けた時に通過率をどれだけ失うか」を見ます。薄いコールを捨てる力は、チケット戦でかなり大きな武器です。'
      :focusLead+'ショート帯では、押し返せないハンドをきちんと降りることも攻撃の一部です。中途半端なコールを減らすほど、次のopen jam/reshoveにチップを残せます。';
  }
  if(action==='fold'&&!facing&&['CO','BTN','SB'].includes(pos)&&bb<=25){
    return focusLead+'後ろ寄りポジションではアンティ回収価値が大きく、リングよりスチールの価値が上がります。ただしバブルでカバーされている時は、下限オープンを少し締めます。';
  }
  if(bubble){
    return focusLead+coverLead+bubbleLead+'この局面はICM/チケット圧が高く、chipEVだけでは判断しません。カバーしている側は圧をかけやすく、カバーされている側は薄い衝突を避けます。';
  }
  return focusLead+'この局面の主軸は「'+axes.primary+'」です。リングゲームのハンド強度だけでなく、有効BB・アンティ・ポジションを合わせて判断します。';
}
// [Codex fix 2026-05-27] AI用の簡易スタック帯別レンジ表。Nash表ではなく、国内チケット戦の訓練用に保守的な境界を置く。
const TOURNAMENT_AI_RANGE_TABLE={
  le10:{
    open:{ep:0.10,mp:0.14,late:0.25,sb:0.34},
    openJam:{ep:0.13,mp:0.18,late:0.34,sb:0.42},
    reshove:{ep:0.09,mp:0.13,late:0.25,sb:0.30},
    flat:{ep:0.00,mp:0.00,late:0.02,sb:0.00,bb:0.18},
    bbDefend:0.26,bbJam:0.12,openSize:2.0,jamFreq:0.82,reshoveFreq:0.76
  },
  le14:{
    open:{ep:0.13,mp:0.18,late:0.32,sb:0.42},
    openJam:{ep:0.12,mp:0.18,late:0.31,sb:0.39},
    reshove:{ep:0.08,mp:0.14,late:0.27,sb:0.32},
    flat:{ep:0.00,mp:0.02,late:0.05,sb:0.00,bb:0.25},
    bbDefend:0.34,bbJam:0.13,openSize:2.0,jamFreq:0.54,reshoveFreq:0.62
  },
  le17:{
    open:{ep:0.15,mp:0.21,late:0.36,sb:0.45},
    openJam:{ep:0.08,mp:0.13,late:0.23,sb:0.30},
    reshove:{ep:0.08,mp:0.15,late:0.29,sb:0.34},
    flat:{ep:0.02,mp:0.05,late:0.08,sb:0.01,bb:0.31},
    bbDefend:0.40,bbJam:0.12,openSize:2.05,jamFreq:0.28,reshoveFreq:0.56
  },
  le25:{
    open:{ep:0.17,mp:0.24,late:0.40,sb:0.47},
    openJam:{ep:0.03,mp:0.06,late:0.12,sb:0.16},
    reshove:{ep:0.07,mp:0.13,late:0.26,sb:0.31},
    flat:{ep:0.04,mp:0.08,late:0.14,sb:0.02,bb:0.38},
    bbDefend:0.46,bbJam:0.10,openSize:2.15,jamFreq:0.10,reshoveFreq:0.42
  }
};
function tournamentAiStackKey(stackBB){
  if(stackBB<=10)return'le10';
  if(stackBB<=14)return'le14';
  if(stackBB<=17)return'le17';
  return'le25';
}
function tournamentAiPosGroup(pos){
  if(pos==='SB')return'sb';
  if(pos==='CO'||pos==='BTN')return'late';
  if(pos==='HJ'||pos==='LJ'||pos==='MP')return'mp';
  return'ep';
}
function tournamentAiHandTags(ri,handFrac){
  return{
    wheelAxs:ri.suited&&ri.hi===14&&ri.lo<=5,
    suitedBroadway:ri.suited&&ri.hi>=12&&ri.lo>=10,
    broadway:ri.hi>=12&&ri.lo>=10,
    suitedConnector:ri.suited&&Math.abs(ri.hi-ri.lo)<=2&&ri.hi>=7,
    pair:ri.pair,
    pairPush:ri.pair&&ri.lo>=5,
    premium:handFrac<=0.075
  };
}
function tournamentAiRule(stackBB,pos,bubble,ri,handFrac,focusId){
  const rule=TOURNAMENT_AI_RANGE_TABLE[tournamentAiStackKey(stackBB)];
  const group=tournamentAiPosGroup(pos);
  const tags=tournamentAiHandTags(ri,handFrac);
  focusId=focusId||'general';
  const icm=bubble?0.82:1.0;
  const bubbleJam=bubble?0.86:1.0;
  const openBoost=(tags.suitedBroadway?0.03:0)+(tags.suitedConnector?0.02:0)+(tags.pair?0.025:0);
  const jamBoost=(tags.wheelAxs?0.055:0)+(tags.pairPush?0.045:0)+(tags.suitedConnector?0.025:0);
  const reshoveBoost=(tags.wheelAxs?0.065:0)+(tags.pairPush?0.055:0)+(tags.suitedBroadway?0.03:0);
  let openMult=1,openJamMult=1,reshoveMult=1,flatMult=1,bbDefMult=1;
  if(focusId==='bbante_steal'){openMult=1.12;bbDefMult=1.08;}
  else if(focusId==='reshove20'){openMult=(group==='ep'||group==='mp')?1.20:1.06;reshoveMult=1.18;flatMult=0.55;}
  else if(focusId==='openjam14'){openJamMult=1.20;openMult=(group==='ep'||group==='mp')?0.72:0.96;flatMult=0.35;}
  else if(focusId==='bubble_call'){openMult=(group==='ep'||group==='mp')?1.12:1.04;flatMult=0.30;reshoveMult=0.92;bbDefMult=0.86;}
  else if(focusId==='bb_defend'){bbDefMult=1.16;openMult=1.24;}
  else if(focusId==='hu_aggression'){openMult=1.55;flatMult=1.45;bbDefMult=1.18;}
  return{
    group,tags,rule,
    openCap:Math.max(0.04,((rule.open[group]||0.12)*icm+openBoost)*openMult),
    openJamCap:Math.max(0.02,((rule.openJam[group]||0.08)*bubbleJam+jamBoost)*openJamMult),
    reshoveCap:Math.max(0.02,((rule.reshove[group]||0.08)*bubbleJam+reshoveBoost)*reshoveMult),
    flatCap:Math.max(0,((rule.flat[group]||0)*icm+(ri.suited?0.025:0)+(tags.pair?0.02:0))*flatMult),
    bbDefendCap:Math.max(0.12,(rule.bbDefend*icm+(ri.suited?0.07:0)+(tags.pair?0.06:0)+(tags.suitedConnector?0.03:0))*bbDefMult),
    bbJamCap:rule.bbJam*bubbleJam+reshoveBoost,
    openSize:rule.openSize,
    jamFreq:rule.jamFreq*(bubble?0.88:1.0),
    reshoveFreq:rule.reshoveFreq*(bubble?0.86:1.0)
  };
}
// [Codex fix 2026-05-27] リザルトでAI簡易レンジ表の該当部分だけを見える化する。
function tournamentRangeHint(ctx,d,holeCards,stackBB,pos){
  if(!ctx||!ctx.enabled||!d||d.street!=='preflop'||!holeCards||holeCards.length<2)return'';
  const ht=handType(holeCards[0],holeCards[1]);
  const handFrac=HAND_COMBO_FRAC[ht]||0.99;
  const ri=aiRankInfo(holeCards);
  const axes=tournamentEvalAxes(ctx,stackBB);
  const r=tournamentAiRule(stackBB,pos,axes.icmPressure==='高',ri,handFrac,ctx.focusId);
  const pct=x=>Math.round(Math.max(0,Math.min(1,x))*100)+'%';
  const handTxt='この手は簡易表で上位約'+pct(handFrac)+'。';
  const facing=!!(d.facingRaise&&(d.toCall||0)>0);
  if(!facing&&pos!=='BB'){
    return handTxt+' '+stackBB+'BB・'+pos+'の目安は open '+pct(r.openCap)+'まで、open jam '+pct(r.openJamCap)+'まで、標準オープン '+r.openSize+'BB。';
  }
  if(facing&&pos==='BB'){
    return handTxt+' BB防衛目安は defend '+pct(r.bbDefendCap)+'まで、BB jam '+pct(r.bbJamCap)+'まで。アンティ込みでも弱いオフスーツは下限外になりやすいです。';
  }
  if(facing){
    return handTxt+' 非BBの対レイズ目安は reshove '+pct(r.reshoveCap)+'まで、flat '+pct(r.flatCap)+'まで。浅い帯ではcall幅をかなり狭く見ます。';
  }
  if(pos==='BB'){
    return handTxt+' BBオプションでは無理にポットを大きくせず、強い手だけ一部レイズ。弱い手はチェックで実現します。';
  }
  return handTxt;
}
// [Codex fix 2026-05-28] Structured tournament range reference for review, JSON export, and future regression tests.
function tournamentRangeProfile(ctx,d,holeCards,stackBB,pos){
  if(!ctx||!ctx.enabled||!d||d.street!=='preflop'||!holeCards||holeCards.length<2)return null;
  const ht=handType(holeCards[0],holeCards[1]);
  const handFrac=HAND_COMBO_FRAC[ht]||0.99;
  const ri=aiRankInfo(holeCards);
  const axes=tournamentEvalAxes(ctx,stackBB);
  const bubble=axes.icmPressure==='高'||ctx.phase==='バブル';
  const r=tournamentAiRule(stackBB,pos,bubble,ri,handFrac,ctx.focusId);
  const pct=x=>Math.round(Math.max(0,Math.min(1,x))*100);
  const facing=!!(d.facingRaise&&(d.toCall||0)>0);
  const raiseLike=d.action==='raise'||d.action==='allin';
  let lane='open';
  let cap=r.openCap;
  let actionLabel='Open';
  let baseline='標準オープン '+r.openSize+'BB';
  if(!facing&&d.action==='allin'){lane='openJam';cap=r.openJamCap;actionLabel='Open jam';baseline='open jam候補';}
  else if(facing&&pos==='BB'&&raiseLike){lane='bbJam';cap=r.bbJamCap;actionLabel='BB jam';baseline='BBの押し返し候補';}
  else if(facing&&pos==='BB'){lane='bbDefend';cap=r.bbDefendCap;actionLabel='BB defend';baseline='BBディフェンス';}
  else if(facing&&raiseLike){lane='reshove';cap=r.reshoveCap;actionLabel='Reshove';baseline='3bet jam / reshove';}
  else if(facing){lane='flat';cap=r.flatCap;actionLabel='Flat';baseline='非BBフラット';}
  const margin=cap-handFrac;
  let verdict='レンジ内';
  let severity='good';
  if(margin<0&&handFrac<=cap+0.045){verdict='境界';severity='border';}
  else if(margin<0){verdict='レンジ外';severity='bad';}
  const caps={
    open:pct(r.openCap),
    openJam:pct(r.openJamCap),
    reshove:pct(r.reshoveCap),
    flat:pct(r.flatCap),
    bbDefend:pct(r.bbDefendCap),
    bbJam:pct(r.bbJamCap)
  };
  const notes=[];
  if(stackBB<=17)notes.push('push/fold寄り');
  else if(stackBB<=25)notes.push('reshoveと小さめオープン重視');
  if(bubble)notes.push('ICM/チケット圧で下限を締める');
  if(pos==='BB')notes.push('BBアンティで防衛幅は広がるが、jamは形を選ぶ');
  if(lane==='flat'&&stackBB<=25)notes.push('浅い帯の非BBコールはかなり狭い');
  return{
    handType:ht,
    handPercent:pct(handFrac),
    stackBB:stackBB,
    position:pos,
    group:r.group,
    lane:lane,
    actionLabel:actionLabel,
    baseline:baseline,
    capPercent:pct(cap),
    marginPercent:Math.round(margin*100),
    verdict:verdict,
    severity:severity,
    caps:caps,
    openSize:r.openSize,
    notes:notes
  };
}
function tournamentRangeProfileText(profile){
  if(!profile)return'';
  const note=profile.notes&&profile.notes.length?' / '+profile.notes.join(' / '):'';
  return profile.handType+' 上位'+profile.handPercent+'%: '+profile.actionLabel+'目安 上位'+profile.capPercent+'% -> '+profile.verdict+'（'+profile.baseline+'）'+note;
}
function simpleHandShape(c1,c2){
  const r1=RANK_VAL[c1.rank]||0,r2=RANK_VAL[c2.rank]||0;
  const hi=Math.max(r1,r2),lo=Math.min(r1,r2);
  const suited=c1.suit===c2.suit,pair=r1===r2,gap=hi-lo;
  return{
    hi,lo,suited,pair,gap,
    wheelAxs:suited&&hi===14&&lo<=5,
    suitedBroadway:suited&&hi>=12&&lo>=10,
    offsuitBroadway:!suited&&hi>=12&&lo>=10,
    dominatedOffsuit:!suited&&((hi===14&&lo<=11)||(hi>=11&&lo>=9&&gap<=3)),
    suitedConnector:suited&&gap<=2&&hi>=7
  };
}
// [Codex fix 2026-06-16] プリフロップは単純な上位%だけでなく、実際のチャートに近い集合レンジを持つ。
// ここは学習用の近似GTO/ライブ基準。将来は外部JSON/CSVのソルバー表に差し替えられるよう独立させる。
const PREFLOP_RANGE_CHARTS={
  open:{
    EP:{pure:'77+,AJs+,KQs,AQo+,A5s,A4s',mix:'66,ATs,KJs,QJs,JTs,T9s,AJo,KQo'},
    MP:{pure:'66+,ATs+,KJs+,QJs,JTs,AQo+,KQo,A5s-A4s',mix:'55,A9s,KTs,QTs,J9s,T9s,98s,AJo,KJo,QJo'},
    HJ:{pure:'55+,A9s+,KTs+,QTs+,JTs,T9s,98s,AJo+,KQo,A5s-A2s',mix:'44,A8s,K9s,Q9s,J9s,T8s,87s,76s,KJo,QJo,JTo,ATo'},
    CO:{pure:'44+,A7s+,K9s+,Q9s+,J9s+,T9s,98s,87s,76s,A9o+,KTo+,QTo+,JTo,A5s-A2s',mix:'33,22,A6s,K8s,Q8s,J8s,T8s,97s,86s,75s,65s,54s,A8o,K9o,Q9o,T9o'},
    BTN:{pure:'22+,A2s+,K2s+,Q5s+,J7s+,T7s+,97s+,86s+,75s+,65s,54s,A2o+,K8o+,Q9o+,J9o+,T9o,98o',mix:'Q2s-Q4s,J2s-J6s,T6s,96s,85s,74s,64s,53s,K5o-K7o,Q8o,J8o,T8o,87o,76o'},
    SB:{pure:'22+,A2s+,K5s+,Q8s+,J8s+,T8s+,98s,87s,76s,65s,A2o+,K9o+,QTo+,JTo',mix:'K2s-K4s,Q5s-Q7s,J7s,T7s,97s,86s,75s,54s,K7o-K8o,Q9o,J9o,T9o'}
  },
  flatVsOpen:{
    IP:{pure:'22-JJ,AQs-ATs,KQs-KTs,QJs-QTs,JTs,T9s,98s,AQo,KQo',mix:'A9s-A5s,K9s,Q9s,J9s,T8s,87s,76s,AJo,KJo,QJo,JTo'},
    OOP:{pure:'22-TT,AQs-AJs,KQs,QJs,JTs,T9s',mix:'ATs,A5s-A2s,KJs-KTs,QTs,98s,87s,AQo,KQo'},
    SB:{pure:'22-99,AQs-AJs,KQs,QJs,JTs',mix:'TT,ATs,A5s-A2s,KJs,QTs,T9s,98s'},
    BB_EP:{pure:'22-QQ,AQs-ATs,KQs-KTs,QJs-QTs,JTs,T9s,98s,87s,AQo,KQo',mix:'A9s-A2s,K9s,Q9s,J9s,T8s,76s,AJo,KJo,QJo'},
    BB_LATE:{pure:'22+,A2s+,K7s+,Q8s+,J8s+,T8s+,97s+,86s+,75s+,65s,54s,A7o+,K9o+,QTo+,JTo,T9o',mix:'K2s-K6s,Q5s-Q7s,J5s-J7s,T6s-T7s,96s,85s,74s,64s,53s,A2o-A6o,K7o-K8o,Q9o,J9o,T8o,98o,87o'}
  },
  threeBet:{
    value:{pure:'QQ+,AKs,AKo',mix:'JJ,TT,AQs,AQo'},
    polar:{pure:'QQ+,AKs,AKo,A5s-A4s',mix:'JJ,TT,AQs,AQo,A3s-A2s,KQs,KJs,QJs,JTs,T9s'},
    blindVsSteal:{pure:'TT+,AQs+,AKo,A5s-A2s,KQs',mix:'99-77,AJs-ATs,KJs-KTs,QJs,JTs,T9s,AQo,KQo'}
  }
};
function preflopRangeTokens(str){
  return String(str||'').split(',').map(function(x){return x.trim();}).filter(Boolean);
}
function preflopRangeTokenMatch(token,ht){
  if(!token||!ht)return false;
  const R='23456789TJQKA';
  function val(r){return R.indexOf(r);}
  const exact=token.replace(/\s+/g,'');
  if(exact===ht)return true;
  if(exact.indexOf('-')>0){
    const p=exact.split('-');
    if(p.length===2){
      const a=p[0],b=p[1];
      if(a.length===2&&b.length===2&&a[0]===a[1]&&b[0]===b[1]&&ht.length===2&&ht[0]===ht[1]){
        const lo=Math.min(val(a[0]),val(b[0])),hi=Math.max(val(a[0]),val(b[0])),hv=val(ht[0]);
        return hv>=lo&&hv<=hi;
      }
      if(a.length===3&&b.length===3&&ht.length===3&&a[0]===b[0]&&a[2]===b[2]&&ht[0]===a[0]&&ht[2]===a[2]){
        const lo=Math.min(val(a[1]),val(b[1])),hi=Math.max(val(a[1]),val(b[1])),hv=val(ht[1]);
        return hv>=lo&&hv<=hi;
      }
    }
  }
  let m=exact.match(/^([2-9TJQKA])\1\+$/);
  if(m&&ht.length===2&&ht[0]===ht[1])return val(ht[0])>=val(m[1]);
  m=exact.match(/^([2-9TJQKA])([2-9TJQKA])([so])\+$/);
  if(m&&ht.length===3&&ht[0]===m[1]&&ht[2]===m[3]){
    return val(ht[1])>=val(m[2])&&val(ht[1])<val(ht[0]);
  }
  return false;
}
function preflopRangeMatch(range,ht){
  return preflopRangeTokens(range).some(function(t){return preflopRangeTokenMatch(t,ht);});
}
function preflopPositionBucket(pos,totalP){
  if(['SB','BB'].includes(pos))return pos;
  if(totalP>=8){
    if(['UTG','UTG+1'].includes(pos))return'EP';
    if(['MP','LJ'].includes(pos))return'MP';
    if(pos==='HJ')return'HJ';
    if(pos==='CO')return'CO';
    if(pos==='BTN')return'BTN';
  }
  if(pos==='UTG')return'EP';
  if(pos==='MP'||pos==='LJ'||pos==='UTG+1')return'MP';
  if(pos==='HJ')return'HJ';
  if(pos==='CO')return'CO';
  if(pos==='BTN')return'BTN';
  return'MP';
}
function preflopChartLookup(kind,ht,pos,totalP,opts){
  opts=opts||{};
  let chart=null,label='';
  if(kind==='open'){
    const bucket=preflopPositionBucket(pos,totalP);
    chart=PREFLOP_RANGE_CHARTS.open[bucket]||PREFLOP_RANGE_CHARTS.open.MP;
    label=bucket+' open';
  }else if(kind==='flat'){
    if(pos==='BB'){
      const ep=['UTG','UTG+1','MP'].includes(opts.openerPos||'');
      chart=PREFLOP_RANGE_CHARTS.flatVsOpen[ep?'BB_EP':'BB_LATE'];
      label=ep?'BB defend vs early':'BB defend vs late';
    }else if(pos==='SB'){
      chart=PREFLOP_RANGE_CHARTS.flatVsOpen.SB;label='SB flat';
    }else{
      const ip=['CO','BTN'].includes(pos);
      chart=PREFLOP_RANGE_CHARTS.flatVsOpen[ip?'IP':'OOP'];
      label=ip?'IP flat':'OOP flat';
    }
  }else if(kind==='threeBet'){
    const steal=['CO','BTN','SB'].includes(opts.openerPos||'');
    const blind=['SB','BB'].includes(pos);
    chart=PREFLOP_RANGE_CHARTS.threeBet[(blind&&steal)?'blindVsSteal':(opts.polar?'polar':'value')];
    label=(blind&&steal)?'blind vs steal 3bet':opts.polar?'polar 3bet':'value 3bet';
  }
  if(!chart)return{bucket:'',label:'',status:'out',mix:'Fold 100%',pure:false,mixCandidate:false};
  const pure=preflopRangeMatch(chart.pure,ht);
  const mixCandidate=!pure&&preflopRangeMatch(chart.mix,ht);
  let status=pure?'pure':mixCandidate?'mix':'out';
  let actionJP=kind==='open'?'Open':kind==='threeBet'?'3bet':(pos==='BB'?'Call/defend':'Call');
  let mix=status==='pure'
    ?(actionJP+' 75-100% / 別ライン 0-25%')
    :status==='mix'
      ?(actionJP+' 20-60% / Foldまたは別ライン 40-80%')
      :(kind==='flat'?'Fold 75-100% / Call 0-25%':kind==='threeBet'?'Fold/Call 75-100% / 3bet 0-25%':'Fold 75-100% / Open 0-25%');
  return{bucket:label,label,status,mix,pure,mixCandidate,pureRange:chart.pure,mixRange:chart.mix};
}
// [Codex fix 2026-06-04] 序盤は「深いから何でも参加」ではなく、ドミネートリスクと実現率で参加レンジを健全化する。
function tournamentEarlyProfile(ctx,d,holeCards,stackBB,pos,totalPlayers,preCtx){
  if(!ctx||!ctx.enabled||ctx.phase!=='序盤'||!d||d.street!=='preflop'||!holeCards||holeCards.length<2)return null;
  const ht=handType(holeCards[0],holeCards[1]);
  const handFrac=HAND_COMBO_FRAC[ht]||0.99;
  const shape=simpleHandShape(holeCards[0],holeCards[1]);
  const pct=x=>Math.round(Math.max(0,Math.min(1,x))*100);
  const facing=!!(d.facingRaise&&(d.toCall||0)>0);
  const raiseLike=d.action==='raise'||d.action==='allin';
  const bb=stackBB||ctx.stackBB||40;
  const activePlayers=totalPlayers||ctx.players||8;
  const ep=['UTG','UTG+1'].includes(pos);
  const mp=['MP','LJ','HJ'].includes(pos);
  const late=['CO','BTN'].includes(pos);
  const oop=['SB','BB','UTG','UTG+1'].includes(pos);
  preCtx=preCtx||{};
  const openerPos=preCtx.openerPos||'';
  const openerStackBB=preCtx.openerStackBB||bb;
  const limpers=preCtx.limpers||0;
  const behind=preCtx.playersBehind==null?null:preCtx.playersBehind;
  const toCall=d.toCall||d.amount||0;
  const stackChips=d.playerChipsBefore||((ctx.bb||1)*bb);
  const callStackPct=stackChips?Math.round(toCall/Math.max(1,stackChips)*100):0;
  const effStackBB=Math.min(bb,openerStackBB||bb);
  let lane='open',cap=live25OpenPct(pos,activePlayers),actionLabel='Open',baseline='序盤オープンレンジ';
  if(!facing&&d.action==='call'){
    lane='limp';cap=0.05;actionLabel='Open limp';baseline='序盤でも基本はraise/fold';
  }else if(facing&&pos==='BB'&&raiseLike){
    lane='bb3bet';cap=0.12+(shape.suitedBroadway?0.025:0)+(shape.wheelAxs?0.035:0)+(shape.pair&&shape.lo>=8?0.035:0);actionLabel='BB 3bet';baseline='序盤BBの押し返し';
  }else if(facing&&pos==='BB'){
    lane='bbDefend';cap=0.46+(shape.suited?0.10:0)+(shape.pair?0.08:0)+(shape.suitedConnector?0.05:0);actionLabel='BB defend';baseline='BBアンティ込みのBB防衛';
  }else if(facing&&raiseLike){
    lane='threeBet';cap=0.075+(shape.suitedBroadway?0.025:0)+(shape.wheelAxs?0.030:0)+(shape.pair&&shape.lo>=8?0.035:0);actionLabel='3BET';baseline='序盤の3BETはバリュー寄り';
  }else if(facing){
    lane='flat';cap=late?0.24:mp?0.17:0.12;actionLabel='Flat';baseline='序盤のコールドコール';
    if(['UTG','UTG+1'].includes(openerPos))cap-=shape.dominatedOffsuit?0.07:0.03;
    if(shape.pair)cap+=0.08;
    if(shape.suitedConnector)cap+=0.05;
    if(shape.suitedBroadway)cap+=0.04;
    if(shape.dominatedOffsuit)cap-=ep?0.09:0.06;
    if(oop)cap-=0.03;
    cap=Math.max(0.03,cap);
  }else{
    if(ep)cap*=0.86;
    else if(mp)cap*=0.94;
    else if(late)cap*=1.04;
    if(shape.dominatedOffsuit)cap-=ep?0.07:0.035;
    if(shape.suitedConnector&&late)cap+=0.025;
    cap=Math.max(0.05,cap);
  }
  const margin=cap-handFrac;
  let verdict='健全',severity='good';
  if(margin<0&&handFrac<=cap+0.045){verdict='境界';severity='border';}
  else if(margin<0){verdict='広すぎ';severity='bad';}
  const risks=[];
  if(shape.dominatedOffsuit)risks.push('ドミネートされやすいオフスーツ');
  if(oop&&lane!=='bbDefend')risks.push('OOPで実現率低下');
  if(lane==='limp')risks.push('リンプ癖');
  if(lane==='flat'&&!shape.pair&&!shape.suited&&!shape.suitedBroadway)risks.push('インプライド不足');
  if(lane==='flat'&&behind!=null&&behind>=3)risks.push('後続スクイーズリスク');
  // [Codex fix 2026-06-04] 投機ハンドは「例外でOK」ではなく、価格・位置・後続人数を満たす時だけ許可する。
  let speculative={type:'',status:'none',reason:'',score:0};
  if(lane==='flat'&&shape.pair&&shape.lo<=9){
    const priceOk=callStackPct<=7;
    const stackOk=effStackBB>=32;
    const behindOk=behind==null||behind<=2||pos==='BTN';
    const score=(priceOk?1:0)+(stackOk?1:0)+(behindOk?1:0);
    speculative={
      type:'setMine',
      status:score>=3?'good':score===2?'border':'bad',
      reason:'セットマイン: 必要額'+callStackPct+'% / 有効'+effStackBB+'BB / 後続'+(behind==null?'不明':behind)+'人',
      score
    };
  }else if(lane==='flat'&&shape.suitedConnector){
    const priceOk=callStackPct<=6;
    const posOk=late;
    const stackOk=effStackBB>=35;
    const openerOk=!['UTG','UTG+1'].includes(openerPos);
    const behindOk=behind==null||behind<=2||pos==='BTN';
    const score=(priceOk?1:0)+(posOk?1:0)+(stackOk?1:0)+(openerOk?1:0)+(behindOk?1:0);
    speculative={
      type:'suitedConnector',
      status:(!posOk||oop||!openerOk)?'bad':score>=4?'good':score===3?'border':'bad',
      reason:'スーテッド連結: 必要額'+callStackPct+'% / '+pos+' / 有効'+effStackBB+'BB / opener '+(openerPos||'不明')+' / 後続'+(behind==null?'不明':behind)+'人',
      score
    };
  }
  let exceptionReason='';
  if(speculative.type==='setMine'&&speculative.status!=='bad')exceptionReason='小〜中ポケットはセットマイン例外。'+speculative.reason+'を満たす時だけ継続候補';
  else if(speculative.type==='suitedConnector'&&speculative.status!=='bad')exceptionReason='後ろ位置のスーテッド連結は低頻度flat例外。'+speculative.reason+'を満たす時だけ継続候補';
  else if(lane==='flat'&&shape.suitedBroadway&&!oop)exceptionReason='スーテッドブロードウェイはドミネート耐性とプレイアビリティがあり継続候補';
  if(speculative.status==='bad')risks.push(speculative.type==='setMine'?'セットマイン条件不足':'スーテッド連結の条件不足');
  let participationLeak='';
  let recommendedRoute='';
  if(lane==='limp'){
    participationLeak=handFrac<=cap+0.20?'レイズすべき手をリンプしている可能性':'弱い手を安く見に行くリンプ癖';
    recommendedRoute=handFrac<=live25OpenPct(pos,activePlayers)+0.03?'raise優先':'fold優先';
  }else if(lane==='flat'){
    participationLeak=exceptionReason?'条件付きflat例外':'安いからコールになりやすいコールドコール';
    recommendedRoute=exceptionReason?'call可。ただしポジションと相手スタック依存':(shape.dominatedOffsuit||oop?'fold/3betに整理':'相手傾向でcallまたは3bet');
  }else{
    recommendedRoute=severity==='bad'?'位置を締める':'レンジ内なら標準サイズで参加';
  }
  if(exceptionReason&&severity==='bad'&&handFrac<=cap+0.08){verdict='境界';severity='border';}
  const plan=severity==='bad'
    ?(lane==='flat'||lane==='limp'?'fold/raiseに整理':'位置を締める')
    :severity==='border'?'相手傾向と後続人数で調整':'自然な参加候補';
  return{handType:ht,handPercent:pct(handFrac),stackBB:bb,position:pos,lane,actionLabel,baseline,capPercent:pct(cap),marginPercent:Math.round(margin*100),verdict,severity,risks,plan,participationLeak,recommendedRoute,exceptionReason,speculative,callStackPct,effStackBB,limpers,openerPos,playersBehind:behind};
}
function tournamentEarlyProfileText(profile){
  if(!profile)return'';
  const risk=profile.risks&&profile.risks.length?' / 注意: '+profile.risks.join('・'):'';
  const route=profile.recommendedRoute?' / 推奨経路: '+profile.recommendedRoute:'';
  const ex=profile.exceptionReason?' / 例外: '+profile.exceptionReason:'';
  const spec=profile.speculative&&profile.speculative.type?' / 投機評価: '+profile.speculative.status+'（'+profile.speculative.reason+'）':'';
  const leak=profile.participationLeak?' / リーク: '+profile.participationLeak:'';
  return profile.handType+' 上位'+profile.handPercent+'%: '+profile.actionLabel+'目安 上位'+profile.capPercent+'% -> '+profile.verdict+'（'+profile.baseline+'） / 方針: '+profile.plan+route+leak+ex+spec+risk;
}
// [Codex fix 2026-06-04] 序盤トーナメントのマルチウェイは、人数・位置・手役の脆さで別軸評価する。
function tournamentEarlyMultiwayProfile(ctx,d,role,nOpponents,pos){
  if(!ctx||!ctx.enabled||ctx.phase!=='序盤'||!d||d.street==='preflop')return null;
  const players=(nOpponents||1)+1;
  if(players<3)return null;
  const note=(role&&role.note)||'';
  const pairTier=role&&role.pairTier;
  const isOOP=['SB','BB','UTG','UTG+1'].includes(pos||d.position||'');
  const lane=d.action==='check'?'check':d.action==='call'?'call':(d.action==='raise'||d.action==='bet'||d.action==='allin')?'bet':d.action;
  const betPct=d.pot?Math.round(((d.amount||0)/Math.max(1,d.pot))*100):0;
  const onePair=!!pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(note);
  const weakPair=['board_pair','under_pair','bottom_pair','low_pair','second_pair'].includes(pairTier);
  const strong=!!(role&&(role.isNut||role.role==='nutted'||role.role==='strong'||role.role==='monster'));
  const draw=!!(role&&role.draw&&(role.draw.flush||role.draw.oesd||role.draw.gutshot||role.draw.straight));
  const comboDraw=!!(role&&role.draw&&role.draw.flush&&(role.draw.oesd||role.draw.gutshot||role.draw.straight));
  let severity=players>=4?'high':'normal';
  let policy='序盤マルチウェイではブラフ頻度を下げ、バリューと強いドロー中心にします。';
  let risk=players>=4?'4way以上で誰かが強いレンジを持ちやすい':'3wayでブラフ成功率とエクイティ実現率が下がる';
  if(isOOP)risk+=' / OOPで実現率が下がる';
  if(onePair&&!strong)policy='ワンペアは強く見すぎず、チェックまたは小さめでポット管理します。';
  if(draw&&!comboDraw&&!strong)policy='ナッツ級やコンボドロー以外のセミブラフ頻度を落とします。';
  if(lane==='bet'&&!strong&&(betPct>=50||weakPair||(!comboDraw&&draw))){
    severity='bad';
    risk+=' / 複数人に大きく打つほど強いレンジだけが残りやすい';
  }else if(lane==='call'&&onePair&&!strong){
    severity=players>=4||weakPair?'bad':'border';
    risk+=' / ワンペアで受けるほど後続ストリートが難しい';
  }else if(lane==='check'&&!strong&&(onePair||weakPair||draw)){
    severity='good';
    policy='この場面はチェックでポット管理し、相手の強いアクションに備えてください。';
  }
  return{players,lane,position:pos||d.position||'',isOOP,betPct,onePair,weakPair,strong,draw,comboDraw,severity,risk,policy};
}
function tournamentEarlyMultiwayProfileText(profile){
  if(!profile)return'';
  const p=profile.players+'way';
  const lane={check:'チェック',call:'コール',bet:'ベット/レイズ'}[profile.lane]||profile.lane;
  return p+' / '+lane+' / '+(profile.isOOP?'OOP':'IP')+' / '+profile.severity+'：'+profile.policy+' 注意: '+profile.risk;
}
// [Codex fix 2026-06-04] 序盤の深いSPRでは、ワンペアを「スタックを入れる手」ではなくポット管理対象として評価する。
function tournamentEarlyDeepSprProfile(ctx,d,role,tex,pos){
  if(!ctx||!ctx.enabled||ctx.phase!=='序盤'||!d||d.street==='preflop'||!role)return null;
  const spr=calcSPR(d.playerChipsBefore||0,d.pot||0);
  if(spr<7)return null;
  const note=role.note||'';
  const pairTier=role.pairTier;
  const onePair=!!pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(note);
  if(!onePair||role.isNut||role.role==='nutted')return null;
  const lane=d.action==='check'?'check':d.action==='call'?'call':(d.action==='raise'||d.action==='bet'||d.action==='allin')?'bet':d.action;
  const betBase=d.toCall>0?Math.max(1,(d.pot||0)-(d.toCall||0)):Math.max(1,d.pot||1);
  const sizePct=lane==='call'?Math.round((d.toCall||d.amount||0)/betBase*100):(d.pot?Math.round((d.amount||0)/Math.max(1,d.pot)*100):0);
  const vulnerable=!!(tex&&(tex.flushy>=3||tex.flushDraw||tex.straightDraw||tex.dynamic||tex.paired));
  const weakPair=['board_pair','under_pair','bottom_pair','low_pair','second_pair'].includes(pairTier)||role.role==='medium';
  const strongOnePair=['top_pair','overpair'].includes(pairTier)&&(role.role==='strong'||role.role==='value');
  let severity='normal';
  let policy='深いSPRではワンペアの価値はショーダウン/薄いバリュー寄り。大きなポットを作りすぎない方針です。';
  let risk='SPR約'+spr+'。後続ストリートで大きなベットを受ける余地が残る';
  if(vulnerable)risk+=' / 動的ボードで上位役にまくられやすい';
  if(lane==='bet'&&(sizePct>=65||(vulnerable&&sizePct>=50)||weakPair)){
    severity=strongOnePair&&!vulnerable&&sizePct<80?'border':'bad';
    policy='序盤の深いSPRでは、ワンペアで大きく打つより小〜中サイズかチェックでポットを管理します。';
  }else if(lane==='call'&&(sizePct>=55||weakPair||vulnerable)){
    severity=weakPair||sizePct>=75?'bad':'border';
    policy='深いSPRのワンペア受けは、必要EQだけでなく次ストリートの大きな圧力まで見ます。';
  }else if(lane==='check'){
    severity='good';
    policy='深いSPRではワンペアのチェックが有効なポット管理です。';
  }
  return{spr,lane,position:pos||d.position||'',sizePct,onePair,weakPair,strongOnePair,vulnerable,severity,policy,risk};
}
function tournamentEarlyDeepSprProfileText(profile){
  if(!profile)return'';
  const lane={check:'チェック',call:'コール',bet:'ベット/レイズ'}[profile.lane]||profile.lane;
  return 'SPR約'+profile.spr+' / '+lane+' / '+profile.severity+'：'+profile.policy+' 注意: '+profile.risk;
}
