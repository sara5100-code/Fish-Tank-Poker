const STREET_W={preflop:1.4,flop:1.0,turn:1.2,river:1.5};

// ボードテクスチャ分析
function boardTex(comm){
  if(!comm||comm.length===0)return{paired:false,tripped:false,flushy:0,monotone:false,twoTone:false,straightDraw:false,flushDraw:false,dynamic:false,highboard:false,lowboard:false};
  const rv=comm.map(c=>RANK_VAL[c.rank]||0);
  const rc={};comm.forEach(c=>rc[c.rank]=(rc[c.rank]||0)+1);
  const sc={};comm.forEach(c=>sc[c.suit]=(sc[c.suit]||0)+1);
  const maxSuit=Math.max(...Object.values(sc));
  const paired=Object.values(rc).some(v=>v>=2);
  const tripped=Object.values(rc).some(v=>v>=3);
  const uniq=[...new Set(rv)].sort((a,b)=>a-b);
  let straightDraw=false;
  if(uniq.length>=2){
    for(let i=0;i<=uniq.length-2;i++){if(uniq[i+1]-uniq[i]<=2)straightDraw=true;}
    if(uniq.length>=3){for(let i=0;i<=uniq.length-3;i++){if(uniq[i+2]-uniq[i]<=4)straightDraw=true;}}
  }
  if(uniq.includes(14)&&uniq.includes(2))straightDraw=true;
  const flushDraw=maxSuit>=3;
  // [Codex fix 2026-06-14] 2トーンフロップはまだ完成ボードではないが、トップペア側には悪いターンが多い。
  // 「完全に静的」とは扱わず、バリュー/プロテクション候補を説明しやすくする。
  const twoTone=maxSuit>=2&&comm.length===3;
  const dynamic=flushDraw||straightDraw;
  const avgRank=rv.reduce((a,b)=>a+b,0)/rv.length;
  // [Claude fix 2026-06-09] 低カードのみの連番(2-3, 3-4, 4-5等)は実質的なストレート脅威が低い。
  // highConnect=true のとき: 上位カードが7以上の連番がある（例: 6-7, J-T, K-Q, Q-J）
  // 2-3や3-4はhighConnect=falseになり、dangerフラグを立てない。
  let highConnect=false;
  for(let i=0;i<=uniq.length-2;i++){if(uniq[i+1]-uniq[i]<=2&&uniq[i+1]>=7)highConnect=true;}
  return{paired,tripped,flushy:maxSuit,monotone:maxSuit>=comm.length&&comm.length>=3,twoTone,straightDraw,flushDraw,dynamic,highboard:avgRank>=10,lowboard:avgRank<=6,highConnect};
}

// [Codex fix 2026-07-12] BLUEPRINT Phase 3: 代表ボード辞書。分類器の上に、役割別の基準頻度とサイズを持たせる。
const REPRESENTATIVE_BOARD_DICTIONARY={
  a_high_dry:{label:'A-high dry',baseline:{pfr_ip:{betPct:72,sizePct:33},pfr_oop:{betPct:62,sizePct:33},caller:{betPct:28,sizePct:33}},reason:'A高ドライはPFR側のレンジ優位が出やすく、小さく広く打つ基準ボードです。'},
  k_high_dry:{label:'K-high dry',baseline:{pfr_ip:{betPct:68,sizePct:33},pfr_oop:{betPct:58,sizePct:33},caller:{betPct:30,sizePct:33}},reason:'K高ドライもPFR側が小さめCBを作りやすいですが、A高より少しだけ受け側の抵抗が残ります。'},
  paired_board:{label:'paired board',baseline:{pfr_ip:{betPct:58,sizePct:33},pfr_oop:{betPct:50,sizePct:33},caller:{betPct:34,sizePct:33}},reason:'ペアボードはナッツ構造が偏りやすく、小さめサイズでレンジを保つ基準です。'},
  monotone:{label:'monotone',baseline:{pfr_ip:{betPct:42,sizePct:33},pfr_oop:{betPct:36,sizePct:33},caller:{betPct:30,sizePct:33}},reason:'モノトーンはフラッシュ保有とブロッカーが重要で、全体のベット頻度を落とします。'},
  two_tone_connected:{label:'two-tone connected',baseline:{pfr_ip:{betPct:48,sizePct:50},pfr_oop:{betPct:40,sizePct:50},caller:{betPct:36,sizePct:50}},reason:'2トーン連結はドローと完成候補が多く、頻度を絞りつつ中サイズを使います。'},
  low_connected:{label:'low connected',baseline:{pfr_ip:{betPct:38,sizePct:50},pfr_oop:{betPct:32,sizePct:50},caller:{betPct:42,sizePct:50}},reason:'低連結は受け側のセット・2ペア・ストレート絡みが増え、PFRの自動CBを抑える基準です。'},
  broadway_connected:{label:'broadway connected',baseline:{pfr_ip:{betPct:52,sizePct:50},pfr_oop:{betPct:44,sizePct:50},caller:{betPct:36,sizePct:50}},reason:'ブロードウェイ連結は双方の強い継続レンジが残り、中頻度・中サイズが基準です。'},
  four_flush_river:{label:'4-flush river',baseline:{pfr_ip:{betPct:34,sizePct:33},pfr_oop:{betPct:28,sizePct:33},caller:{betPct:30,sizePct:33}},reason:'4枚同色リバーはナッツ/強ブロッカー以外の大きな圧力を抑える基準です。'},
  paired_river:{label:'paired river',baseline:{pfr_ip:{betPct:42,sizePct:33},pfr_oop:{betPct:34,sizePct:33},caller:{betPct:36,sizePct:33}},reason:'ペア化リバーはフルハウスが絡むため、非ナッツの薄いバリューやブラフを小さめに扱います。'}
};
function representativeBoardClass(profile){
  if(!profile)return null;
  if(profile.street==='river'&&profile.fourFlush)return'four_flush_river';
  if(profile.street==='river'&&profile.paired)return'paired_river';
  if(profile.primary==='a_high_dry')return'a_high_dry';
  if(profile.primary==='k_high_dry'||profile.primary==='q_high_dry')return'k_high_dry';
  if(profile.primary==='paired'||profile.primary==='trips_board')return'paired_board';
  if(profile.primary==='monotone'||profile.primary==='four_flush')return profile.street==='river'&&profile.fourFlush?'four_flush_river':'monotone';
  if(profile.twoTone&&profile.connectedness>=2)return'two_tone_connected';
  if(profile.primary==='low_connected'||profile.primary==='wet_connected')return'low_connected';
  if(profile.primary==='broadway_connected'||profile.primary==='straight_complete')return'broadway_connected';
  return null;
}
function representativeBoardRoleKey(opts){
  opts=opts||{};
  if(opts.isPfr)return opts.isIP?'pfr_ip':'pfr_oop';
  return'caller';
}
function representativeBoardProfile(profile,opts){
  const key=representativeBoardClass(profile);
  if(!key)return null;
  const entry=REPRESENTATIVE_BOARD_DICTIONARY[key];
  const roleKey=representativeBoardRoleKey(opts);
  const base=(entry.baseline&&entry.baseline[roleKey])||entry.baseline.caller;
  return{key,label:entry.label,roleKey,betPct:base.betPct,sizePct:base.sizePct,reason:entry.reason};
}

// プレイヤー固有のドロー検出
// [Codex fix 2026-06-16] GTO理論設計 Phase 3: 公開ボードを独立分類し、後続の頻度/レンジ更新の土台にする。
function boardTextureProfile(comm,street,prevComm){
  if(!comm||comm.length<3)return null;
  street=street||({3:'flop',4:'turn',5:'river'}[comm.length]||'flop');
  prevComm=prevComm||[];
  const tex=boardTex(comm);
  const ranks=comm.map(function(c){return RANK_VAL[c.rank]||0;}).sort(function(a,b){return a-b;});
  const uniq=[...new Set(ranks)];
  const suits={};comm.forEach(function(c){suits[c.suit]=(suits[c.suit]||0)+1;});
  const maxSuit=Math.max.apply(null,Object.values(suits));
  const rankCounts={};comm.forEach(function(c){rankCounts[c.rank]=(rankCounts[c.rank]||0)+1;});
  const hasA=uniq.includes(14),hasK=uniq.includes(13),hasQ=uniq.includes(12);
  let connectedness=0;
  for(let i=0;i<uniq.length-1;i++){
    const gap=uniq[i+1]-uniq[i];
    if(gap===1)connectedness+=2;
    else if(gap===2)connectedness+=1;
  }
  const broadway=uniq.filter(function(v){return v>=10;}).length;
  const low=uniq.filter(function(v){return v<=9;}).length>=Math.min(3,uniq.length);
  const paired=Object.values(rankCounts).some(function(v){return v>=2;});
  const trips=Object.values(rankCounts).some(function(v){return v>=3;});
  const pairedRanks=Object.keys(rankCounts).filter(function(r){return rankCounts[r]>=2;}).map(function(r){return RANK_VAL[r]||0;}).sort(function(a,b){return b-a;});
  const pairRank=pairedRanks.length?pairedRanks[0]:null;
  const topRank=uniq.length?uniq[uniq.length-1]:null;
  const pairClass=pairRank==null?'none':pairRank>=12?'high_pair':pairRank>=9?'middle_pair':'low_pair';
  const monotone=maxSuit>=3&&comm.length===3;
  const fourFlush=maxSuit>=4;
  const twoTone=maxSuit===2&&comm.length===3;
  let straightComplete=false;
  if(uniq.length>=5){for(let i=0;i<=uniq.length-5;i++){if(uniq[i+4]-uniq[i]===4)straightComplete=true;}}
  if(uniq.includes(14)&&uniq.includes(5)&&uniq.includes(4)&&uniq.includes(3)&&uniq.includes(2))straightComplete=true;
  const straightThreat=!!(tex.straightDraw||connectedness>=3||straightComplete);
  const flushThreat=!!(fourFlush||monotone||tex.flushDraw);
  const dynamic=!!(flushThreat||straightThreat||paired||connectedness>=3);
  const staticBoard=!dynamic&&(hasA||hasK||hasQ)&&connectedness<=1&&maxSuit<2;
  let primary='standard';
  if(trips)primary='trips_board';
  else if(paired)primary='paired';
  else if(fourFlush)primary='four_flush';
  else if(monotone)primary='monotone';
  else if(straightComplete)primary='straight_complete';
  else if(straightThreat&&flushThreat)primary='wet_connected';
  else if(straightThreat)primary=low?'low_connected':'broadway_connected';
  else if(twoTone)primary='two_tone';
  else if(staticBoard)primary=hasA?'a_high_dry':hasK?'k_high_dry':'q_high_dry';
  else if(low)primary='low_dry';
  const prevTex=prevComm&&prevComm.length>=3?boardTex(prevComm):null;
  const newCard=prevComm&&prevComm.length<comm.length?comm[comm.length-1]:null;
  let transition='none';
  if(newCard&&prevTex){
    const newRank=RANK_VAL[newCard.rank]||0;
    const newSuitCount=comm.filter(function(c){return c.suit===newCard.suit;}).length;
    const pairsBoard=comm.filter(function(c){return c.rank===newCard.rank;}).length>=2&&prevComm.filter(function(c){return c.rank===newCard.rank;}).length<2;
    if(pairsBoard)transition='board_pair';
    else if(newSuitCount>=3&&maxSuit>prevTex.flushy)transition=maxSuit>=4?'four_flush_card':'flush_complete_card';
    else if(straightComplete&&!prevTex.straightDraw)transition='straight_complete_card';
    else if(newRank>=12&&(!prevComm.some(function(c){return (RANK_VAL[c.rank]||0)>=newRank;})))transition='overcard';
    else if(!tex.dynamic||(!flushThreat&&!straightThreat))transition='blank';
    else transition='texture_card';
  }
  const rangeTilt=(primary==='a_high_dry'||primary==='k_high_dry'||primary==='q_high_dry')?'pfr_range_advantage':
    (primary==='low_connected'||primary==='wet_connected'||(primary==='paired'&&pairClass==='low_pair'))?'caller_nut_interaction':
    (primary==='paired'&&pairClass==='high_pair')?'pfr_range_advantage':'neutral';
  const nutVolatility=(paired||trips)?'fullhouse/quads':fourFlush||monotone?'flush_heavy':straightComplete||straightThreat?'straight_heavy':'low';
  const labels={a_high_dry:'A-high dry',k_high_dry:'K-high dry',q_high_dry:'Q-high dry',low_dry:'low dry',two_tone:'two-tone',monotone:'monotone',four_flush:'four-flush',paired:'paired board',trips_board:'trips board',low_connected:'low connected',broadway_connected:'broadway connected',wet_connected:'wet connected',straight_complete:'straight complete',standard:'standard'};
  const transitionLabels={none:'none',blank:'blank',overcard:'overcard',board_pair:'board pair',flush_complete_card:'flush-completing card',four_flush_card:'four-flush card',straight_complete_card:'straight-completing card',texture_card:'texture-changing card'};
  const reasons=[];
  if(paired)reasons.push('ペアボードでフルハウス/トリップスのナッツ優位が重要');
  if(monotone||fourFlush)reasons.push('同色が多く、フラッシュ保有/ブロッカーが重要');
  else if(twoTone)reasons.push(street==='river'?'未完成フラッシュは空振り。ブロッカーとブラフ候補を確認':'フラッシュドローが残る');
  if(straightThreat)reasons.push(street==='river'?'連結度がありストレート完成レンジを確認':'連結度がありストレート完成/強ドローが残る');
  if(staticBoard)reasons.push('高いカード中心でPFR側が小さく高頻度に打ちやすい');
  if(low&&!straightThreat)reasons.push('低いカード中心で受け側のペア/セットも残りやすい');
  if(transition!=='none')reasons.push('前ストリートからの変化: '+transitionLabels[transition]);
  const baseProfile={street,primary,label:labels[primary]||primary,transition,transitionLabel:transitionLabels[transition]||transition,paired,trips,pairRank,pairClass,topRank,monotone,twoTone,fourFlush,flushThreat,straightThreat,straightComplete,connectedness,broadway,low,dynamic,staticBoard,rangeTilt,nutVolatility,reasons,raw:tex};
  baseProfile.representativeClass=representativeBoardClass(baseProfile);
  baseProfile.representative=baseProfile.representativeClass?REPRESENTATIVE_BOARD_DICTIONARY[baseProfile.representativeClass]:null;
  return baseProfile;
}
function boardTextureProfileText(p){
  if(!p)return'';
  const bits=[p.label];
  if(p.transition&&p.transition!=='none')bits.push(p.transitionLabel);
  bits.push(p.dynamic?'動的':'静的');
  if(p.rangeTilt==='pfr_range_advantage')bits.push('PFR側レンジ優位');
  else if(p.rangeTilt==='caller_nut_interaction')bits.push('受け側のナッツ絡みあり');
  if(p.reasons&&p.reasons.length)bits.push(p.reasons.slice(0,2).join(' / '));
  return bits.join(' / ');
}

// [Codex fix 2026-06-16] ボード分類をGTO頻度へ接続する。基礎bet率を置き換えず、構造ごとの補正として扱う。
function boardTextureFrequencyAdjustment(baseBetProb,profile,opts){
  baseBetProb=Math.max(0,Math.min(1,baseBetProb||0));
  if(!profile)return{betProb:baseBetProb,checkProb:1-baseBetProb,baseBetPct:Math.round(baseBetProb*100),betPct:Math.round(baseBetProb*100),checkPct:Math.round((1-baseBetProb)*100),label:'標準ボード',reason:'ボード構造による追加補正なし',preferredSizePct:null};
  opts=opts||{};
  const street=opts.street||profile.street||'flop';
  const role=opts.role||{};
  const isPfr=!!opts.isPfr;
  const nOpponents=opts.nOpponents||1;
  let mult=1.0,cap=0.88,floor=0.03,preferredSizePct=null;
  const notes=[];
  function note(t){if(t)notes.push(t);}
  const rep=representativeBoardProfile(profile,{isPfr,isIP:!!opts.isIP});
  if(rep){
    baseBetProb=Math.max(0,Math.min(1,baseBetProb*0.65+(rep.betPct/100)*0.35));
    preferredSizePct=rep.sizePct;
    note(rep.label+'基準: '+rep.reason);
  }
  if(profile.rangeTilt==='pfr_range_advantage'){
    if(isPfr){mult*=street==='flop'?1.22:1.08;cap=Math.min(cap,street==='flop'?0.82:0.74);preferredSizePct=33;note('PFR側のレンジ優位が出やすく、小さめ高頻度のCBを作りやすい');}
    else{mult*=0.88;cap=Math.min(cap,0.62);note('受け側はレンジ優位が薄く、無理なリード頻度を落とす');}
  }
  if(profile.primary==='monotone'){
    mult*=0.72;cap=Math.min(cap,0.56);preferredSizePct=role.isNut||role.role==='nutted'?50:33;note('モノトーンはフラッシュ保有とブロッカーが重要で、全体のベット頻度は下がる');
  }else if(profile.primary==='four_flush'){
    mult*=0.55;cap=Math.min(cap,0.45);preferredSizePct=role.isNut||role.role==='nutted'?50:33;note('4枚同色ではナッツ/強ブロッカー以外の大きな圧力を控える');
  }else if(profile.primary==='low_connected'||profile.primary==='wet_connected'||profile.primary==='straight_complete'){
    mult*=0.68;cap=Math.min(cap,0.54);preferredSizePct=(role.role==='strong'||role.role==='nutted'||role.isNut)?65:40;note('低連結・完成寄りのボードは受け側のセット/ストレート絡みが増え、CB頻度を落とす');
  }else if(profile.primary==='broadway_connected'){
    mult*=0.82;cap=Math.min(cap,0.64);preferredSizePct=50;note('ブロードウェイ連結は強い継続レンジが残りやすく、頻度を少し絞る');
  }else if(profile.primary==='paired'||profile.primary==='trips_board'){
    mult*=profile.primary==='trips_board'?0.62:0.84;cap=Math.min(cap,profile.primary==='trips_board'?0.48:0.66);preferredSizePct=33;note('ペアボードはナッツ優位とフルハウス/トリップスの濃さを確認して打つ');
  }else if(profile.primary==='two_tone'){
    mult*=0.93;cap=Math.min(cap,0.72);preferredSizePct=50;note(street==='river'?'2トーンのままリバーなら、未完成フラッシュは空振りとして扱う':'2トーンはドローが残るため、完全なドライボードほど高頻度には打たない');
  }else if(profile.primary==='low_dry'){
    mult*=isPfr?0.86:0.95;cap=Math.min(cap,0.64);preferredSizePct=33;note('低いドライボードは受け側の小ペア/セットも残り、PFRの自動CBを少し抑える');
  }
  if(profile.transition==='flush_complete_card'||profile.transition==='four_flush_card'){mult*=0.62;cap=Math.min(cap,0.50);preferredSizePct=role.isNut||role.role==='nutted'?50:33;note('フラッシュ完成カードでワンペアやエアの継続頻度を落とす');}
  else if(profile.transition==='board_pair'){mult*=0.74;cap=Math.min(cap,0.58);preferredSizePct=33;note('ボードペア化でナッツ構造が変わり、薄いバリュー/ブラフは慎重にする');}
  else if(profile.transition==='straight_complete_card'){mult*=0.70;cap=Math.min(cap,0.55);preferredSizePct=(role.role==='strong'||role.isNut)?65:40;note('ストレート完成カードでレンジの強弱がはっきりし、弱い手の頻度を落とす');}
  else if(profile.transition==='overcard'&&isPfr){mult*=1.08;cap=Math.min(cap,0.76);preferredSizePct=40;note('オーバーカードはPFR側のレンジに当たりやすく、継続頻度を少し上げる');}
  if(nOpponents>=2){mult*=nOpponents>=3?0.72:0.84;cap=Math.min(cap,nOpponents>=3?0.46:0.58);note('マルチウェイではブラフ成功率が下がるため、頻度を落とす');}
  if(role.isNut||role.role==='nutted'){floor=Math.max(floor,0.40);cap=Math.max(cap,0.70);note('ナッツ級はボードが重くてもバリュー頻度を残す');}
  else if(role.role==='air'&&(profile.flushThreat||profile.straightThreat||profile.paired)){mult*=0.82;cap=Math.min(cap,0.44);note('エアは重いボードでフォールドエクイティが落ちる');}
  const adjusted=Math.max(floor,Math.min(cap,baseBetProb*mult));
  return{label:profile.label,primary:profile.primary,representativeClass:rep&&rep.key,representativeLabel:rep&&rep.label,representativeRole:rep&&rep.roleKey,transition:profile.transition,baseBetPct:Math.round(baseBetProb*100),betPct:Math.round(adjusted*100),checkPct:Math.round((1-adjusted)*100),betProb:adjusted,checkProb:1-adjusted,multiplier:Math.round(mult*100)/100,capPct:Math.round(cap*100),preferredSizePct:preferredSizePct?standardBetSizePct(preferredSizePct):preferredSizePct,reason:notes.slice(0,3).join('。')};
}

// [Codex fix 2026-06-16] ボード分類から、初心者が選ぶべき標準ベットサイズを決める。
function boardTextureSizePlan(pot,profile,role,opts){
  if(!pot||!profile)return null;
  opts=opts||{};
  role=role||{};
  const mode=opts.mode||(typeof getRangeMode==='function'?getRangeMode():'live');
  const isNut=!!(role.isNut||role.role==='nutted');
  const isStrong=!!(isNut||role.role==='strong');
  const isOnePair=!!((role.pairTier==='top_pair'||role.pairTier==='overpair'||role.pairTier==='second_pair')&&!isNut);
  const isAir=role.role==='air';
  let pct=opts.preferredSizePct||null;
  let reason='';
  const rep=representativeBoardProfile(profile,{isPfr:!!opts.isPfr,isIP:!!opts.isIP});
  if(rep){
    pct=pct||rep.sizePct;
    reason=rep.reason;
  }
  if(profile.primary==='a_high_dry'||profile.primary==='k_high_dry'||profile.primary==='q_high_dry'){
    pct=33;reason='高いカードのドライボードは、PFR側が小さく広く打つサイズが基本です。';
  }else if(profile.primary==='low_dry'){
    pct=33;reason='低いドライボードは受け側の小ペア/セットも残るので、小さめでレンジ全体を保ちます。';
  }else if(profile.primary==='two_tone'){
    pct=isStrong?50:33;reason='2トーンはドローに払わせたい一方、弱い手で大きくしすぎないサイズが中心です。';
  }else if(profile.primary==='monotone'||profile.primary==='four_flush'){
    pct=isNut?50:33;reason='同色が多いボードはナッツ/ブロッカーの有無が大事で、非ナッツは小さめに抑えます。';
  }else if(profile.primary==='low_connected'||profile.primary==='wet_connected'||profile.primary==='straight_complete'){
    pct=isStrong?75:50;reason=profile.street==='river'?'連結・完成寄りのリバーは強い完成役で大きめ、弱い手や薄いバリューは控えめにします。':'連結・完成寄りのボードは強いバリュー/強ドローで大きめ、弱い手は控えめにします。';
  }else if(profile.primary==='broadway_connected'){
    pct=isStrong?65:50;reason='ブロードウェイ連結は継続レンジが強くなりやすく、中サイズ以上を中心にします。';
  }else if(profile.primary==='paired'||profile.primary==='trips_board'){
    pct=isNut?50:33;reason='ペアボードはナッツ構造が偏るため、小さめでレンジを広く保つのが基本です。';
  }
  if(profile.transition==='flush_complete_card'||profile.transition==='four_flush_card'){
    pct=isNut?50:33;reason='フラッシュ完成カードでは、非ナッツの大サイズを避けて小〜中サイズに寄せます。';
  }else if(profile.transition==='board_pair'){
    pct=isNut?50:33;reason='ボードペア化でフルハウスが絡むため、薄いバリューは小さく扱います。';
  }else if(profile.transition==='straight_complete_card'){
    pct=isStrong?65:40;reason='ストレート完成カードでは、強いレンジだけ大きく、ワンペア以下は控えます。';
  }else if(profile.transition==='overcard'&&opts.isPfr){
    pct=Math.max(pct||0,40);reason=reason||'オーバーカードはPFR側に当たりやすく、小〜中サイズで継続しやすいカードです。';
  }
  if(isOnePair&&(profile.flushThreat||profile.straightThreat||profile.paired)){
    pct=Math.min(pct||50,profile.transition&&profile.transition!=='none'?40:45);
    reason='ワンペアは強く見えても、完成寄り・動的ボードでは小〜中サイズでポットを管理します。';
  }
  if(opts.nOpponents>=2&&!isNut){
    pct=Math.min(pct||50,40);
    reason='マルチウェイではコールされるレンジが強いため、非ナッツの大サイズを避けます。';
  }
  if(mode==='live'){
    const opponentType=opts.opponentTypeProfile||null;
    const callStation=!!(opponentType&&(opponentType.label==='コール多め'||opponentType.valueLoosen));
    const completedLike=!!(profile.primary==='monotone'||profile.primary==='four_flush'||profile.primary==='straight_complete'||profile.transition==='flush_complete_card'||profile.transition==='four_flush_card'||profile.transition==='straight_complete_card'||profile.transition==='board_pair');
    if(isAir){
      pct=Math.min(pct||33,33);
      reason='Live $2/$5ではコールされやすいので、空ブラフは小さく打つかチェック寄りにします。';
    }else if((isNut||isStrong)&&!completedLike&&opts.nOpponents<2){
      pct=Math.max(pct||50,callStation?75:50);
      reason='Live $2/$5では下のペアやドローに払ってもらえる時、強いバリューはGTOより取り切り寄りにします。';
    }else if(isOnePair&&(completedLike||profile.flushThreat||profile.straightThreat||opts.nOpponents>=2)){
      pct=Math.min(pct||50,40);
      reason='Live $2/$5ではワンペアを重いボードで大きく打つと、弱い手が降りて強い手だけに続けられやすくなります。';
    }
  }else if(mode==='gto'){
    if((profile.staticBoard||profile.primary==='a_high_dry'||profile.primary==='k_high_dry'||profile.primary==='q_high_dry')&&opts.isPfr&&!isNut){
      pct=Math.min(pct||33,33);
      reason='GTO基準では、レンジ優位のドライボードは小さめ高頻度のベットを多く使います。';
    }else if(isNut||isStrong){
      pct=Math.min(Math.max(pct||50,50),75);
      reason=reason||'GTO基準では、強いハンドもレンジ全体のサイズ構成に合わせて50〜75%potを中心にします。';
    }
  }
  if(!pct)return null;
  pct=standardBetSizePct(Math.max(25,Math.min(125,Math.round(pct))));
  return{pct,amt:Math.round(pot*pct/100),reason,mode,source:rep?'representative_board':'board_texture',representativeClass:rep&&rep.key,representativeLabel:rep&&rep.label,representativeRole:rep&&rep.roleKey};
}

// [Codex fix 2026-06-21] ターンカードを「誰に良いか」「続けるか止まるか」で読める判断軸にする。
function turnCardMeaningProfile(profile,role,opts){
  if(!profile||!profile.transition||profile.transition==='none')return null;
  opts=opts||{}; role=role||{};
  const t=profile.transition;
  const isPfr=!!opts.isPfr;
  const isNut=!!(role.isNut||role.role==='nutted');
  const isStrong=!!(isNut||role.role==='strong');
  let label='ターン変化カード',favors='neutral',pressure='medium',barrel='mixed',reason='ターンでボード構造が変わったため、前ストリートの評価を更新します。',advice='サイズと相手レンジを見て、続けるか止まるかを分けます。';
  if(t==='blank'){
    label='ブランク';
    favors='range_preserved';pressure='low';barrel=isPfr?'continue':'mixed';
    reason='ブランクは完成レンジを大きく増やさないため、フロップ時点のレンジ優位が残りやすいカードです。';
    advice=isPfr?'フロップで主導権がある側は、バリューと良いドローで継続しやすいです。':'受け側は無理にリードせず、ショーダウン価値とドローを整理します。';
  }else if(t==='overcard'){
    label='オーバーカード';
    favors=isPfr?'pfr':'neutral';pressure='medium';barrel=isPfr?'continue':'caution';
    reason='オーバーカードはPFR側の高カードレンジに当たりやすく、受け側の小〜中ペアには嫌なカードです。';
    advice=isPfr?'小〜中サイズで継続しやすいカードです。ただし相手のコールレンジが強い時は頻度を落とします。':'受け側から大きく打つには、強いトップペア以上か良いドローが必要です。';
  }else if(t==='flush_complete_card'||t==='four_flush_card'){
    label=t==='four_flush_card'?'4枚フラッシュカード':'フラッシュ完成カード';
    favors=isNut?'hero':'draw_complete';pressure='high';barrel=isNut?'value':'slow_down';
    reason='フラッシュが完成し、ワンペアや空振りの価値が下がります。Aハイフラッシュや強いブロッカーの有無が重要です。';
    advice=isNut?'強いフラッシュ以上はバリューを残せます。非ナッツはサイズを抑えます。':'非ナッツのワンペアやエアは、チェックや小さめに寄せます。';
  }else if(t==='straight_complete_card'){
    label='ストレート完成カード';
    favors='caller';pressure='high';barrel=isStrong?'value':'slow_down';
    reason='ストレート完成カードは、受け側の連結ハンドやドロー完成を増やします。';
    advice=isStrong?'強い完成役なら取れますが、相手の完成レンジを意識してサイズを選びます。':'ワンペア以下や空振りは、無理な2発目を減らします。';
  }else if(t==='board_pair'){
    label='ボードペア化';
    favors=profile.pairClass==='high_pair'?'pfr':'caller';pressure='high';barrel=isNut?'value':'slow_down';
    reason='ボードペア化でフルハウス/トリップスの比重が上がり、非ナッツの強さが下がります。';
    advice=isNut?'フルハウス級ならバリューを残せます。':'ワンペア、ストレート、弱いフラッシュはポット管理を優先します。';
  }else if(t==='texture_card'){
    label='重くなるカード';
    favors='neutral';pressure='medium_high';barrel=isStrong?'value':'mixed';
    reason='フラッシュ/ストレートの可能性や強いドローが増え、ターン以降の相手レンジが濃くなります。';
    advice='強いバリューと良いドローは続け、弱いワンペアや空振りは頻度とサイズを落とします。';
  }
  return{label,favors,pressure,barrel,reason,advice,transition:t};
}
// [Codex fix 2026-06-16] ターン/リバーの変化カードを、実際の評価重みに接続する。
function boardTextureTransitionProfile(d,profile,role,opts){
  if(!d||!profile||!profile.transition||profile.transition==='none')return null;
  opts=opts||{};
  role=role||{};
  const meaning=turnCardMeaningProfile(profile,role,opts);
  const lane=d.action==='check'?'check':d.action==='call'?'call':(d.action==='raise'||d.action==='bet'||d.action==='allin')?'bet':d.action;
  const pot=Math.max(1,d.pot||1);
  const basePot=d.toCall>0?Math.max(1,pot-(d.toCall||0)):pot;
  const sizePct=lane==='call'?Math.round((d.toCall||d.amount||0)/basePot*100):Math.round((d.amount||0)/pot*100);
  const isNut=!!(role.isNut||role.role==='nutted');
  const isStrong=!!(isNut||role.role==='strong');
  const onePair=!!(role.pairTier||role.role==='medium');
  let verdict='normal',severity='normal',policy='',suggest='',axis='ボード変化カード';
  const t=profile.transition;
  if(t==='flush_complete_card'||t==='four_flush_card'){
    axis='フラッシュ完成カード';
    if(isNut){verdict='good';severity='good';policy='フラッシュ完成カードでもナッツ級ならバリューを残せます。ただし下のフラッシュやフルハウスに注意し、サイズは中サイズ中心です。';}
    else if((onePair||role.role==='air')&&(lane==='bet'||lane==='call')&&sizePct>=45){verdict='bad';severity='bad';policy=d.street==='river'?'フラッシュ完成リバーでワンペア以下が大きく続けると、相手の継続レンジはフラッシュなどの完成役や強いブラフキャッチ寄りになります。':'フラッシュ完成カードでワンペア以下が大きく続けると、相手の継続レンジがフラッシュ/強いドロー寄りになります。';suggest='推奨: チェックまたはフォールド寄り。打つなら小さめ';}
    else if(lane==='check'||lane==='fold'){verdict='good';severity='good';policy='フラッシュ完成カードでは、非ナッツのワンペアやエアを無理に膨らませない判断が自然です。';}
  }else if(t==='board_pair'){
    axis='ボードペア化';
    if(isNut){verdict='good';severity='good';policy='ボードペア化でナッツ級なら、フルハウス/クアッズ側としてバリューを残せます。';}
    else if(role&&role.madeClass==='flush'&&(role.weakFlush||role.flushHighRank<=9)&&(lane==='bet'||lane==='call')&&sizePct>=45){verdict='border';severity='border';policy='ボードペア上の弱フラッシュは完成役ですが、フルハウス・トリップス・上位フラッシュに当たりやすいため、小さめに扱います。';suggest='推奨: 25〜40%potかチェック。大きいレイズには慎重にフォールド';}
    else if((onePair||role.isVuln)&&(lane==='bet'||lane==='call')&&sizePct>=50){verdict='bad';severity='bad';policy='ボードペア化でフルハウスがレンジに入るため、非ナッツのワンペア/フラッシュ/ストレートの大きな継続は危険です。';suggest='推奨: 小さく扱うかチェック。大きいベットには慎重に';}
    else if(lane==='check'||lane==='fold'){verdict='good';severity='good';policy='ボードペア化では、非ナッツをポット管理する判断が自然です。';}
  }else if(t==='straight_complete_card'){
    axis='ストレート完成カード';
    if(isStrong){verdict='normal';severity='normal';policy='ストレート完成カードで強い完成役なら、相手のコールレンジを見て中〜大サイズを選びます。';}
    else if((onePair||role.role==='air')&&(lane==='bet'||lane==='call')&&sizePct>=45){verdict='bad';severity='bad';policy='ストレート完成カードでワンペア以下が大きく続けると、完成レンジに寄った相手へ払いすぎます。';suggest='推奨: チェック/フォールド寄り';}
    else if(lane==='check'||lane==='fold'){verdict='good';severity='good';policy='ストレート完成カードでは、完成していない手を無理に押さないのが自然です。';}
  }else if(t==='overcard'){
    axis='オーバーカード';
    if(opts.isPfr&&(lane==='bet'||lane==='check')){verdict=lane==='bet'?'good':'normal';severity=lane==='bet'?'good':'normal';policy='オーバーカードはPFR側のレンジに当たりやすく、小〜中サイズの継続を作りやすいカードです。';}
    else if(!opts.isPfr&&lane==='bet'&&sizePct>=50&&!isStrong){verdict='border';severity='border';policy='オーバーカードを受け側から大きく打つ時は、相手の強いトップペア/オーバーペアにぶつかりやすいです。';}
  }else if(t==='texture_card'){
    axis='動的変化カード';
    if(((onePair&&!isStrong)||role.role==='air')&&(lane==='bet'||lane==='call')&&sizePct>=60){verdict='border';severity='border';policy='ボードが重く変化した時は、ワンペア以下の大サイズを少し控えます。';}
  }else if(t==='blank'){
    axis='ブランクカード';
    policy='大きな構造変化が少ないカードなので、前ストリートのレンジ優位と手役を継続して見ます。';
  }
  if(!policy)return null;
  return{street:d.street,transition:t,transitionLabel:profile.transitionLabel,axis,lane,sizePct,onePair,isNut,isStrong,meaning,verdict,severity,policy,suggest};
}
function boardTextureTransitionProfileText(p){
  if(!p)return'';
  const lane={check:'チェック',call:'コール',bet:'ベット/レイズ',fold:'フォールド'}[p.lane]||p.lane;
  return p.axis+' / '+lane+' / '+p.verdict+'：'+p.policy;
}

// [Codex fix 2026-06-16] Range advantage / nut advantageを、単なる表示ではなく判断軸として保持する。
// [Codex fix 2026-06-20] ポストフロップのベットを「何のために打つか」で評価する。
// [Codex fix 2026-06-21] ブラフは「打てるサイズ」より先に、候補としての質を確認する。
function postflopBluffCandidateProfile(hr,d,role,texture,rangeProfile,opts){
  if(!hr||!d||d.street==='preflop'||d.street==='river')return null;
  opts=opts||{}; role=role||{}; texture=texture||{}; rangeProfile=rangeProfile||{};
  const lane=opts.lane||'';
  const bluffLane=lane==='semiBluff'||lane==='weakDrawBluff'||lane==='airBluff'||lane==='rangeCbet';
  if(!bluffLane)return null;
  const human=hr.players?hr.players.find(function(p){return p.isHuman;}):null;
  const hole=human&&human.holeCards?human.holeCards:[];
  const board=hr.community?hr.community.slice(0,(d.street==='turn'?4:3)):[];
  const boardHigh=board.reduce(function(m,c){return Math.max(m,RANK_VAL[c.rank]||0);},0);
  const heroRanks=hole.map(function(c){return RANK_VAL[c.rank]||0;});
  const suitCnt={};
  board.forEach(function(c){suitCnt[c.suit]=(suitCnt[c.suit]||0)+1;});
  const drawSuit=Object.keys(suitCnt).find(function(s){return suitCnt[s]>=2;})||'';
  const hasNutFlushBlocker=!!(drawSuit&&hole.some(function(c){return c.suit===drawSuit&&c.rank==='A';}));
  const hasHighFlushBlocker=!!(drawSuit&&hole.some(function(c){return c.suit===drawSuit&&(RANK_VAL[c.rank]||0)>=12;}));
  const hasOvercardBlocker=heroRanks.some(function(v){return v>boardHigh&&v>=12;});
  const blocker=hasNutFlushBlocker?'ナッツフラッシュブロッカー'
    :hasHighFlushBlocker?'高いフラッシュブロッカー'
    :hasOvercardBlocker?'高いオーバーカード'
    :'明確なブロッカーなし';
  const sizePct=opts.sizePct||Math.round((d.amount||0)/Math.max(1,d.pot||1)*100);
  const strongDraw=!!opts.strongDraw;
  const weakDraw=!!opts.weakDraw;
  const air=!!opts.air;
  const rangeHigh=!!opts.rangeHigh;
  const multiway=!!opts.multiway;
  const dynamic=!!opts.dynamic;
  const staticDry=!!(texture.staticBoard);
  const opponentType=opts.opponentType||null;
  const callHeavy=!!(opponentType&&opponentType.bluffTighten);
  let kind='条件不足のブラフ候補';
  let severity='bad';
  let target='相手の空振りや弱いAハイ';
  let foldOut='こちらより少し強いが続けにくい手';
  let frequency='低頻度';
  let sizeBand='チェック優先';
  let policy='降ろせる手、ブロッカー、コールされた時の保険が足りません。';
  let suggest='推奨: チェック。ブラフは強いドローか良いブロッカーがある時に回します';
  if(strongDraw){
    kind='強いドローのセミブラフ候補';
    severity=multiway&&sizePct>=65?'border':'good';
    target='弱いペア、Aハイ、エクイティのある空振り';
    foldOut='今は勝っているが強く続けにくいメイドハンド';
    frequency=multiway?'中〜低頻度':'中〜高頻度';
    sizeBand=multiway?'33〜50%pot中心':'33〜75%pot';
    policy='今すぐ降ろす価値に加えて、コールされても改善する価値があります。';
    suggest=severity==='good'?'推奨: セミブラフ候補。サイズは相手が降りる範囲とコール後の改善価値で選びます':'推奨: 候補ではあるが、マルチウェイや大きすぎるサイズでは頻度を落とします';
  }else if(lane==='rangeCbet'&&rangeHigh&&staticDry&&!multiway&&sizePct<=40){
    kind='レンジ優位の小さめブラフ候補';
    severity='good';
    target='広い空振り、弱いAハイ、バックドアだけの手';
    foldOut='相手レンジの外れた部分';
    frequency='中頻度';
    sizeBand='25〜33%pot';
    policy='こちらのレンジ優位を小さく広く使うブラフです。手札単体より、ボードと主導権で成立します。';
    suggest='推奨: 小さく打つなら自然。大きくするとレンジCBの軽さとズレます';
  }else if((hasNutFlushBlocker||hasHighFlushBlocker||hasOvercardBlocker)&&rangeHigh&&!multiway&&sizePct<=55&&!callHeavy){
    kind='ブロッカー付きの低頻度ブラフ候補';
    severity=weakDraw||air?'border':'good';
    target='弱いペア、Aハイ、バックドアだけの手';
    foldOut='こちらより少し強いが、強く続けにくい手';
    frequency='低〜中頻度';
    sizeBand='33〜50%pot';
    policy='ブロッカーで相手の強い継続レンジを少し減らせます。ただし、相手が降りる前提が必要です。';
    suggest='相手依存: 小〜中サイズで一部。コール多め相手にはチェック寄り';
  }
  if(callHeavy&&(air||weakDraw)&&severity!=='good'){
    severity='bad';
    frequency='かなり低頻度';
    sizeBand='チェック優先';
    policy='相手がコール多めなら、ブロッカーだけでは足りません。弱いブラフは捕まりやすくなります。';
    suggest='推奨: チェック。打つなら強いドローか、後続で強く撃てる根拠が必要です';
  }
  if(multiway&&(air||weakDraw)&&severity!=='good'){
    severity='bad';
    frequency='かなり低頻度';
    sizeBand='チェック優先';
    policy='マルチウェイでは全員を降ろす必要があるため、弱いブラフ候補は大きく価値が落ちます。';
    suggest='推奨: チェック。強いドロー以外のブラフ頻度を落とします';
  }
  if(dynamic&&(air||weakDraw)&&!hasNutFlushBlocker&&!hasHighFlushBlocker&&severity!=='good'){
    severity='bad';
    policy='重いボードでは相手の継続レンジが強く、ブロッカーのない弱いブラフは通りにくいです。';
  }
  return{
    axis:'ブラフ候補',
    kind,severity,target,foldOut,blocker,frequency,sizeBand,policy,suggest,
    summary:'候補='+kind+' / ブロッカー='+blocker+' / 頻度='+frequency+' / サイズ='+sizeBand
  };
}
function postflopBetPurposeProfile(hr,d,role,texture,rangeProfile,opts){
  if(!hr||!d||d.street==='preflop'||d.street==='river')return null;
  const betLike=d.action==='bet'||d.action==='raise'||d.action==='allin';
  if(!betLike)return null;
  opts=opts||{}; role=role||{}; texture=texture||null; rangeProfile=rangeProfile||{};
  const opponentType=opts.opponentTypeProfile||null;
  const pot=Math.max(1,d.pot||1);
  const sizePct=Math.round((d.amount||0)/pot*100);
  const facing=!!((d.toCall||0)>0);
  const street=d.street||'flop';
  const multiway=(opts.nOpponents||1)>=2;
  const isPfr=!!opts.isPfr;
  const isRiver=street==='river';
  const isNut=!!(role.isNut||role.role==='nutted');
  const strongMade=!!(isNut||role.role==='strong'||(!role.pairTier&&role.role==='value'));
  const onePair=!!(role.pairTier||/ワンペア|トップペア|オーバーペア|中・低ペア|ミドルペア/.test(role.note||''));
  const strongOnePair=!!(onePair&&['top_pair','overpair'].includes(role.pairTier||'')&&(role.role==='strong'||role.role==='value'));
  const weakMade=!!(onePair&&!strongOnePair&&!strongMade);
  const drawOuts=role.draw&&role.draw.outs?role.draw.outs:0;
  const strongDraw=!!(!isRiver&&drawOuts>=8);
  const weakDraw=!!(!isRiver&&drawOuts>0&&drawOuts<8);
  const air=!!(role.role==='air'||/ハイカード|ドロー失敗/.test(role.note||''));
  const dynamic=!!(texture&&(texture.dynamic||texture.flushThreat||texture.straightThreat||texture.paired));
  const staticDry=!!(texture&&texture.staticBoard);
  const rangeHigh=!!(rangeProfile&&(rangeProfile.heroRangeAdv==='高'||rangeProfile.heroRangeAdv==='high'||rangeProfile.heroRangeAdv==='高い'||rangeProfile.rangeOwner==='hero'));
  const nutLow=!!(rangeProfile&&(rangeProfile.heroNutAdv==='低'||rangeProfile.heroNutAdv==='low'||rangeProfile.nutOwner==='villain'));
  const sizePlan=texture?boardTextureSizePlan(pot,texture,role,{isPfr,nOpponents:opts.nOpponents||1,opponentTypeProfile:opponentType}):null;
  const recommendedPct=sizePlan&&sizePlan.pct?sizePlan.pct:null;
  const sizeTooLarge=!!(recommendedPct&&sizePct>=recommendedPct+25&&sizePct>=65);
  const sizeTooSmall=!!(recommendedPct&&sizePct<=recommendedPct-25&&strongMade&&!isNut&&sizePct<=33);
  let lane='postflopBet',purpose='ベット',target='相手レンジ',severity='border',verdict='ベット理由を確認',policy='',risk='',suggest='';
  if(isNut||strongMade&&!onePair){
    lane='value'; purpose='強いバリュー'; target='下の完成役や強いワンペア';
    severity=sizeTooSmall?'border':'good';
    verdict=sizeTooSmall?'強い手の小さすぎるバリュー':'強い手のバリューベット';
    policy='強い完成役は、相手が払える下の完成役や強いワンペアを想定してベットします。';
    suggest=sizeTooSmall?'推奨: もう少し大きく。目安は'+(recommendedPct||50)+'%pot前後':'推奨: バリュー継続。サイズは相手がコールできる下の手を基準に選びます';
  }else if(strongOnePair){
    lane=isRiver?'thinValue':'protectionValue'; purpose=isRiver?'薄いバリュー':'バリュー兼プロテクション'; target=isRiver?'下のワンペアや弱いショーダウン価値':'下のペア、オーバーカード、ドロー';
    const tooBig=(isRiver&&dynamic&&sizePct>=55)||(!isRiver&&dynamic&&sizePct>=75)||multiway&&sizePct>=55||sizeTooLarge;
    severity=tooBig?'bad':sizePct<=45||!dynamic?'good':'border';
    verdict=tooBig?'ワンペアで大きく打ちすぎ':'ワンペアの目的あるベット';
    policy=isRiver?'リバーのワンペアは、どの下の手にコールしてほしいかを先に決めます。':'フロップ/ターンの強いワンペアは、下の手から取りつつ、ドローやオーバーカードに無料で見せない目的があります。';
    suggest=tooBig?'推奨: 小〜中サイズかチェック。目安は'+(recommendedPct||40)+'%pot前後':'推奨: 小〜中サイズ中心。大きくするなら相手が広くコールする根拠が必要です';
  }else if(weakMade){
    lane='weakMadeBet'; purpose='薄いプロテクション'; target='オーバーカードや弱いドロー';
    const bad=multiway||dynamic&&sizePct>=45||sizePct>=60||nutLow;
    severity=bad?'bad':'border';
    verdict=bad?'弱い完成役で打ちすぎ':'弱い完成役の薄いプロテクション';
    policy='弱いワンペアや下のペアは、強いバリューではなくショーダウン価値を守る手です。打つなら小さく、チェックも自然です。';
    suggest=bad?'推奨: チェック寄り。打つなら25〜33%potまで':'相手依存: 小さく打つかチェック。大きいポットは作らない';
  }else if(strongDraw){
    lane='semiBluff'; purpose='セミブラフ'; target='フォールドするAハイ/弱ペアと、コールされても改善する未来';
    const bad=multiway&&sizePct>=60||sizePct>=100&&!isNut;
    severity=bad?'border':'good';
    verdict=bad?'セミブラフのサイズ過多':'良いセミブラフ候補';
    policy='強いドローは、今フォールドを取る価値と、コールされても改善する価値の両方があります。';
    suggest=bad?'推奨: 33〜75%potに抑える。マルチウェイでは頻度を落とす':'推奨: 33〜75%potを中心にベット候補';
  }else if(weakDraw){
    lane='weakDrawBluff'; purpose='弱いドローのブラフ'; target='相手の空振りや弱いAハイ';
    const good=rangeHigh&&staticDry&&sizePct<=40&&!multiway;
    severity=good?'border':'bad';
    verdict=good?'レンジ優位を使う小さめブラフ':'弱いドローで打ちすぎ';
    policy='弱いドローは、改善率だけでは足りません。レンジ優位、フォールドエクイティ、サイズが揃う時だけ打ちます。';
    suggest=good?'相手依存: 小さく低頻度で可':'推奨: チェック寄り。強いドローや良いブロッカーを待つ';
  }else if(air){
    lane=rangeHigh&&staticDry&&isPfr&&sizePct<=40&&!multiway?'rangeCbet':'airBluff';
    purpose=lane==='rangeCbet'?'レンジCB':'空振りブラフ';
    target=lane==='rangeCbet'?'相手の広い空振りレンジ':'フォールドしてくれる弱いレンジ';
    severity=lane==='rangeCbet'?'good':'bad';
    verdict=lane==='rangeCbet'?'レンジ優位を使う小さめCB':'ブラフ条件不足';
    policy=lane==='rangeCbet'?'A/K/Q高のドライボードでは、PFR側が小さく広く打てる場面があります。':'エアで打つ時は、相手が十分に降りる構造とブロッカーが必要です。重いボードやマルチウェイでは無理に作りません。';
    suggest=lane==='rangeCbet'?'推奨: 小さめCBで可。目安は33%pot':'推奨: チェック。打つなら強いブロッカーと明確なフォールド先が必要';
  }
  if(facing&&lane!=='value'&&lane!=='semiBluff'){
    severity=severity==='good'?'border':'bad';
    verdict='レイズ理由を再確認';
    policy+=' 相手のベットにレイズする時は、コールされた時に勝っている手か、降ろしたい強い手が明確である必要があります。';
    suggest='推奨: コール/フォールド寄り。レイズは強いバリューか強いドローに絞ります';
  }
  const targetPlan=postflopBetTargetPlan({lane,purpose,target,street,sizePct,recommendedPct,severity,strongOnePair,weakMade,strongDraw,weakDraw,air,rangeHigh,nutLow,dynamic,multiway,isPfr,facing},texture,role,rangeProfile);
  const bluffCandidate=postflopBluffCandidateProfile(hr,d,role,texture,rangeProfile,{lane,sizePct,strongDraw,weakDraw,air,rangeHigh,dynamic,multiway,opponentType});
  if(targetPlan&&targetPlan.severity==='bad'){
    severity='bad';
    if(targetPlan.verdict)verdict=targetPlan.verdict;
    if(targetPlan.suggest)suggest=targetPlan.suggest;
  }else if(targetPlan&&targetPlan.severity==='border'&&severity==='good'){
    severity='border';
  }
  if(bluffCandidate&&bluffCandidate.severity==='bad'){
    severity='bad';
    verdict=bluffCandidate.kind;
    suggest=bluffCandidate.suggest||suggest;
  }else if(bluffCandidate&&bluffCandidate.severity==='border'&&severity==='good'){
    severity='border';
  }
  if(opponentType&&opponentType.label&&opponentType.label!=='標準的'){
    if(opponentType.bluffTighten&&(air||weakDraw||lane==='airBluff'||lane==='weakDrawBluff')){
      severity='bad';
      verdict='コール多め相手へのブラフ過多';
      suggest='推奨: チェック寄り。打つなら、後で強く続けられるドローや明確なブロッカーがある時だけ';
    }else if(opponentType.valueLoosen&&(strongOnePair||lane==='thinValue'||lane==='protectionValue')&&severity!=='bad'){
      if(severity==='border'&&sizePct<=55)severity='good';
      suggest=suggest||'推奨: 小〜中サイズで薄いバリューを取る';
    }else if(opponentType.bluffLoosen&&(air||weakDraw||lane==='rangeCbet')&&rangeHigh&&sizePct<=40&&severity!=='bad'){
      severity=severity==='good'?'good':'border';
    }
  }
  risk=sizePct+'%pot / '+purpose+' / 対象='+target+(texture?(' / ボード='+texture.label):'')+(multiway?' / マルチウェイ':'')+(recommendedPct?(' / 目安='+recommendedPct+'%pot'):'')+(opponentType&&opponentType.label&&opponentType.label!=='標準的'?(' / 相手タイプ='+opponentType.label):'')+(targetPlan&&targetPlan.summary?(' / '+targetPlan.summary):'')+(bluffCandidate&&bluffCandidate.summary?(' / '+bluffCandidate.summary):'');
  return{lane,purpose,target,street,sizePct,recommendedPct,axis:'ポストフロップのベット目的',severity,verdict,policy,risk,suggest,sizePlan,targetPlan,bluffCandidate,opponentType,strongMade,onePair,strongOnePair,weakMade,strongDraw,weakDraw,air,rangeHigh,nutLow,dynamic,multiway};
}
function postflopBetPurposeProfileText(p){
  if(!p)return'';
  const plan=p.targetPlan&&p.targetPlan.text?' '+p.targetPlan.text:'';
  return p.verdict+' — '+p.policy+plan+' 注意: '+p.risk;
}

// [Codex fix 2026-06-21] フロップ/ターンのレイズ・チェックレイズを、通常ベットとは別に評価する。
function postflopRaisePlanProfile(hr,d,role,texture,rangeProfile,opts){
  if(!hr||!d||d.street==='preflop'||d.street==='river')return null;
  if(!(d.action==='raise'||d.action==='allin'))return null;
  const facing=!!((d.toCall||0)>0||d.facingRaise);
  if(!facing)return null;
  opts=opts||{}; role=role||{}; texture=texture||{}; rangeProfile=rangeProfile||{};
  const before=hr.decisions?hr.decisions.slice(0,hr.decisions.indexOf(d)):[];
  const street=d.street||'flop';
  const heroChecked=before.some(function(x){return x&&x.isHuman&&x.street===street&&x.action==='check';});
  const villainBet=before.slice().reverse().find(function(x){return x&&!x.isHuman&&x.street===street&&(x.action==='bet'||x.action==='raise'||x.action==='allin');})||null;
  const pot=Math.max(1,d.pot||1);
  const sizePct=Math.round((d.amount||0)/pot*100);
  const multiway=(opts.nOpponents||1)>=2;
  const isNut=!!(role.isNut||role.role==='nutted');
  const strongMade=!!(isNut||role.role==='strong'||(!role.pairTier&&role.role==='value'));
  const onePair=!!(role.pairTier||/ワンペア|トップペア|オーバーペア|中・低ペア|ミドルペア/.test(role.note||''));
  const strongOnePair=!!(onePair&&['top_pair','overpair'].includes(role.pairTier||'')&&(role.role==='strong'||role.role==='value'));
  const weakMade=!!(onePair&&!strongOnePair&&!strongMade);
  const drawOuts=role.draw&&role.draw.outs?role.draw.outs:0;
  const strongDraw=!!(drawOuts>=8);
  const weakDraw=!!(drawOuts>0&&drawOuts<8);
  const air=!!(role.role==='air'||/ハイカード/.test(role.note||''));
  const dynamic=!!(texture.dynamic||texture.flushThreat||texture.straightThreat||texture.paired);
  const rangeHigh=!!(rangeProfile&&(rangeProfile.heroRangeAdv==='高'||rangeProfile.heroRangeAdv==='high'||rangeProfile.rangeOwner==='hero'));
  const lane=heroChecked?'checkRaise':'raiseVsBet';
  const label=heroChecked?'チェックレイズ':'相手ベットへのレイズ';
  let severity='border',verdict='レイズ理由を確認',policy='',suggest='',target='相手のベットレンジ',foldOut='弱いワンペアや空振り';
  if(isNut||strongMade&&!onePair){
    severity='good';verdict=label+'で取り切る強手';
    target='下の完成役、強いワンペア、強いドロー';
    foldOut='ほとんど降ろす必要はなく、主目的はバリュー';
    policy='強い完成役は、相手がベットした勢いを利用してポットを大きくできます。コールしてほしい下の完成役を先に想定してサイズを選びます。';
    suggest='推奨: バリューでレイズ。目安は相手ベットの2.5〜4倍、深い時は相手が払える範囲に調整';
  }else if(strongDraw){
    const tooLarge=multiway&&sizePct>=120||sizePct>=175;
    severity=tooLarge?'border':'good';verdict=tooLarge?'強いドローの大きすぎるレイズ':'強いドローの良いセミブラフレイズ';
    target='フォールドするワンペア/Aハイと、コールされても改善できる未来';
    foldOut='上のAハイ、弱いワンペア、エクイティのある空振り';
    policy='強いドローのレイズは、今フォールドを取る価値と、コールされても引いた時に勝てる価値が両方あります。';
    suggest=tooLarge?'推奨: サイズを抑える。マルチウェイではコール寄りも混ぜる':'推奨: セミブラフレイズ可。相手が降りないタイプならコール寄り';
  }else if(strongOnePair){
    const bad=multiway||dynamic&&sizePct>=100;
    severity=bad?'bad':'border';verdict=bad?'強いワンペアのレイズしすぎ':'強いワンペアの境界レイズ';
    target='下のワンペアや強いドロー';
    foldOut='弱いペアや空振り';
    policy='ワンペアでレイズすると、相手の続行レンジは強いドロー・ツーペア以上・強いトップペアに寄ります。バリューよりポット管理が自然な場面が多いです。';
    suggest=bad?'推奨: コール中心。レイズは相手が広く払う時だけ小さめ':'相手依存: 小さめ低頻度。大きく膨らませない';
  }else if(weakMade){
    severity='bad';verdict='弱い完成役のレイズしすぎ';
    target='ほぼ明確な支払い先がない';
    foldOut='相手の空振りや下の弱い手';
    policy='弱いワンペアや下のペアは、レイズしても悪い手は降り、強い手とドローに続けられやすいです。ショーダウン価値を守るコール/チェックが中心です。';
    suggest='推奨: コールまたはフォールド。レイズは避ける';
  }else if(weakDraw||air){
    const goodBluff=rangeHigh&&!multiway&&!dynamic&&sizePct<=75;
    severity=goodBluff?'border':'bad';verdict=goodBluff?'条件付きの小さなブラフレイズ':'ブラフレイズの条件不足';
    target='フォールドしてくれる空振りや弱いペア';
    foldOut='相手の空振り、弱いAハイ、弱いペア';
    policy='弱いドローやエアでレイズするには、相手が十分に降りる構造と良いブロッカーが必要です。$2/$5ではコールされやすく、無理なブラフレイズは高くつきます。';
    suggest=goodBluff?'低頻度なら可。大きくしすぎない':'推奨: フォールド/コール寄り。強いドローを待つ';
  }
  if(multiway&&severity==='good'&&!strongMade&&!isNut)severity='border';
  const pressure=villainBet?('相手ベット '+Math.round((villainBet.amount||0)/Math.max(1,villainBet.pot||1)*100)+'%pot'):'相手ベットあり';
  const text=label+'。コールしてほしい相手は「'+target+'」、降ろしたい相手は「'+foldOut+'」です。'+policy;
  const risk=sizePct+'%pot / '+pressure+' / '+(dynamic?'動的ボード':'静的ボード')+(multiway?' / マルチウェイ':'');
  return{lane,label,axis:'ポストフロップのレイズ判断',street,sizePct,severity,verdict,policy,suggest,target,foldOut,risk,text,checkRaise:heroChecked,strongMade,onePair,strongOnePair,weakMade,strongDraw,weakDraw,air,dynamic,multiway};
}
function postflopRaisePlanProfileText(p){
  if(!p)return'';
  return p.verdict+' — '+p.text+' 注意: '+p.risk;
}

// [Codex fix 2026-06-20] ベット対象レンジとサイズの整合性を分けて見る。
function postflopBetTargetPlan(p,texture,role,rangeProfile){
  if(!p)return null;
  const size=p.sizePct||0;
  const heavy=!!(texture&&(texture.dynamic||texture.flushThreat||texture.straightThreat||texture.paired));
  const dry=!!(texture&&texture.staticBoard);
  const multiway=!!p.multiway;
  let target='相手の広い継続レンジ';
  let foldOut='弱い空振り';
  let sizeFit='neutral';
  let severity='good';
  let verdict='';
  let suggest='';
  let text='';
  if(p.lane==='value'){
    target=size>=75?'強いワンペア、2ペア、下の完成役':'下のペア、強いワンペア、ドローを含む広めの継続';
    foldOut='ほぼ不要。降ろすより払わせる場面';
    sizeFit=size>=75?'大きめで取り切り':'中サイズで広く払わせる';
    text='このベットは、降ろすより下の完成役に払わせる目的です。サイズを大きくするほど、相手の続行レンジは強い手に寄ります。';
  }else if(p.lane==='protectionValue'){
    target='下のワンペア、オーバーカード、フラッシュ/ストレートドロー';
    foldOut='エクイティのある空振りや弱いドロー';
    const tooBig=(heavy||multiway)&&size>=65;
    severity=tooBig?'bad':size<=55?'good':'border';
    verdict=tooBig?'対象レンジに対してサイズが大きすぎ':'対象レンジとサイズはおおむね一致';
    suggest=tooBig?'推奨: 33〜50%pot。弱い手にも払わせつつ、無料カードを防ぎます':'推奨: 33〜50%pot中心。大きくするなら相手が広く払う根拠が必要';
    sizeFit=tooBig?'弱い手を降ろしすぎる':'下の手とドローに払わせやすい';
    text='このベットは、下の手から少し取りつつ無料カードを防ぐ目的です。大きくしすぎると、払ってほしい弱い手が降りて強い手だけが残ります。';
  }else if(p.lane==='weakMadeBet'){
    target='オーバーカードや弱いドロー';
    foldOut='自分より少し弱いがエクイティのある手';
    const tooBig=size>=45||heavy||multiway;
    severity=tooBig?'bad':'border';
    verdict=tooBig?'薄いプロテクションに対してサイズが重い':'小さなプロテクション候補';
    suggest=tooBig?'推奨: チェック多め。打つなら25〜33%potまで':'推奨: 小さく打つかチェック。大きいポットは作らない';
    sizeFit=tooBig?'ベット対象が狭すぎる':'最低限のプロテクション';
    text='弱いワンペアや下のペアは、強いバリューではありません。大きく打つほど、相手の弱い手は降り、苦しいコールだけが残りやすくなります。';
  }else if(p.lane==='semiBluff'){
    target='弱いペア、Aハイ、すぐには続けにくい空振り';
    foldOut='今勝っている弱いメイドハンドや空振り';
    const tooBig=multiway&&size>=65;
    severity=tooBig?'border':'good';
    verdict=tooBig?'セミブラフとしてはやや大きい':'対象レンジがあるセミブラフ';
    suggest=tooBig?'推奨: 33〜50%pot寄り。マルチウェイではフォールド率を低く見積もります':'推奨: 33〜75%pot。フォールドと改善の両方を狙えます';
    sizeFit=tooBig?'相手が降りにくい場面で重い':'フォールドと改善率が噛み合う';
    text='セミブラフは、今すぐ降ろす価値と、コールされても改善する価値の両方で成立します。相手が多い時はフォールド率を低く見ます。';
  }else if(p.lane==='rangeCbet'){
    target='広い空振り、弱いペア、バックドアだけの手';
    foldOut='相手レンジの外れた部分';
    const bad=size>=55||!dry;
    severity=bad?'border':'good';
    verdict=bad?'レンジCBとしては少し重い':'レンジCBとして自然';
    suggest=bad?'推奨: 25〜33%pot寄り。レンジ優位を小さく広く使います':'推奨: 25〜33%pot。広いレンジに小さく圧をかけます';
    sizeFit=bad?'レンジCBの軽さとズレる':'小さく広く打つ目的に合う';
    text='レンジCBは、強い手だけでなくレンジ全体の優位を小さく広く使うベットです。大きく打つほど、レンジ全体で打つ理由は薄くなります。';
  }else if(p.lane==='weakDrawBluff'||p.lane==='airBluff'){
    target='フォールドできる空振りと弱いAハイ';
    foldOut='自分より強いが続けにくい手';
    const good=p.rangeHigh&&dry&&size<=40&&!multiway;
    severity=good?'border':'bad';
    verdict=good?'ブラフ対象はあるが低頻度':'ブラフ対象レンジが足りない';
    suggest=good?'相手依存: 小さく低頻度で可':'推奨: チェック。降ろせる手が少ない時は無理に作らない';
    sizeFit=good?'小さくなら成立余地あり':'サイズ以前にフォールド先が足りない';
    text='ブラフは、相手が実際に降ろせる手を十分に持っている時だけ成立します。降りる手が少ない相手や重いボードでは、チェックの価値が上がります。';
  }
  return{target,foldOut,sizeFit,severity,verdict,suggest,text,summary:'対象='+target+' / 降ろす手='+foldOut+' / サイズ整合='+sizeFit};
}

// [Codex fix 2026-06-20] フロップで打った後、ターンで続ける/止める理由を分けて見る。
function postflopBarrelPlanProfile(hr,d,role,texture,purposeProfile,rangeActionProfile,opts){
  if(!hr||!d||d.street!=='turn')return null;
  opts=opts||{}; role=role||{}; texture=texture||{}; purposeProfile=purposeProfile||null; rangeActionProfile=rangeActionProfile||null;
  const idx=streetDecisionIndex(hr,d);
  const before=idx>=0?hr.decisions.slice(0,idx):hr.decisions;
  const heroFlopBet=before.find(function(x){return x.isHuman&&x.street==='flop'&&(x.action==='bet'||x.action==='raise'||x.action==='allin');});
  if(!heroFlopBet)return null;
  const villainFlopCall=before.some(function(x){return !x.isHuman&&x.street==='flop'&&x.action==='call';});
  const villainFlopRaise=before.some(function(x){return !x.isHuman&&x.street==='flop'&&(x.action==='raise'||x.action==='allin');});
  if(villainFlopRaise)return null;
  const lane=(d.action==='bet'||d.action==='raise'||d.action==='allin')?'barrel':d.action==='check'?'check':'other';
  if(lane==='other')return null;
  const pot=Math.max(1,d.pot||1);
  const sizePct=Math.round((d.amount||0)/pot*100);
  const transition=texture.transition||'none';
  const turnMeaning=turnCardMeaningProfile(texture,role,opts);
  const completed=transition==='flush_complete_card'||transition==='four_flush_card'||transition==='straight_complete_card'||transition==='board_pair';
  const blank=transition==='blank'||transition==='none';
  const rangeGood=transition==='overcard'&&opts.isPfr||blank||(turnMeaning&&turnMeaning.favors==='pfr');
  const slowsDown=!!(turnMeaning&&turnMeaning.barrel==='slow_down');
  const isNut=!!(role.isNut||role.role==='nutted');
  const isStrong=!!(isNut||role.role==='strong');
  const strongOnePair=!!(role.pairTier&&(role.role==='strong'||role.role==='value'));
  const weakMade=!!(role.pairTier&&!strongOnePair&&!isStrong);
  const strongDraw=!!(role.draw&&role.draw.outs>=8);
  const air=!!(role.role==='air'||/ハイカード|ドロー失敗/.test(role.note||''));
  let severity='border',verdict='ターン継続を確認',policy='',suggest='',target='相手のフロップコールレンジ',text='';
  if(lane==='barrel'){
    if(isStrong||isNut){
      severity='good';verdict='続けて取るバリューバレル';
      policy='フロップでコールされた後も、こちらに強い完成役があります。ターンでは下の完成役や強いワンペアからさらに取る理由があります。';
      suggest='推奨: 50〜75%pot中心。相手が広く払うなら大きめも候補';
      target='下の完成役、強いワンペア、強いドロー';
    }else if(strongDraw&&!completed&&!slowsDown){
      severity='good';verdict='改善率を持った2発目';
      policy='強いドローは、ターンでもフォールドを取る価値と、コールされてもリバーで改善する価値があります。';
      suggest='推奨: 40〜70%pot。相手が降りないタイプなら頻度を落とします';
      target='弱いワンペア、Aハイ、ドローを嫌う中程度の手';
    }else if(rangeGood&&air&&opts.isPfr&&sizePct<=50){
      severity='border';verdict='レンジ継続の小さめ2発目';
      policy='ターンカードがこちらのレンジに悪くないため、小さめに続ける余地があります。ただし実ハンドの改善がない時は頻度を抑えます。';
      suggest='相手依存: 25〜50%potで低〜中頻度';
      target='フロップを一度コールした弱いペアや空振り';
    }else if((weakMade||air)&&(completed||slowsDown)){
      severity='bad';verdict='完成カードで無理な2発目';
      policy=(turnMeaning&&turnMeaning.reason?turnMeaning.reason+' ':'')+'弱いワンペアや空振りで大きく続けると、相手の強い継続レンジに払いやすくなります。';
      suggest='推奨: チェック寄り。打つなら小さく、明確なブロッカーが必要';
      target='本来は降ろしたい手が少なく、相手の強い手が残りやすい';
    }else if(strongOnePair&&(completed||slowsDown)&&sizePct>=55){
      severity='border';verdict='ワンペアの2発目は慎重';
      policy=(turnMeaning&&turnMeaning.reason?turnMeaning.reason+' ':'')+'強いワンペアでも、相手のコールレンジが濃くなるターンでは、大きく続けるよりチェックや小さめでポットを管理します。';
      suggest='推奨: チェック〜40%pot寄り';
      target='下のワンペアと一部ドロー。ただし完成役に注意';
    }else{
      severity=sizePct>=75?'border':'good';verdict='継続理由のある2発目';
      policy=(turnMeaning&&turnMeaning.advice?turnMeaning.advice+' ':'')+'フロップで作った主導権を、ターンでも相手のコールレンジとボード変化に合わせて使う場面です。';
      suggest='推奨: 33〜60%potを中心に、相手が続ける手を先に決めます';
    }
  }else if(lane==='check'){
    if(completed&&!isStrong&&!strongDraw){
      severity='good';verdict='完成カードで止まる良いチェック';
      policy=(turnMeaning&&turnMeaning.reason?turnMeaning.reason+' ':'')+'無理に2発目を打たずポットを管理する判断です。';
      suggest='推奨: チェック継続。相手のサイズ次第でコール/フォールドを分けます';
    }else if(isStrong&&villainFlopCall){
      severity='border';verdict='強い手の取り逃し候補';
      policy='フロップで相手がコールしており、こちらに強い完成役があります。チェックも罠としてあり得ますが、基本は下の手から取る候補を残します。';
      suggest='推奨: 50%pot前後のバリューを検討';
    }else if(strongDraw){
      severity='border';verdict='強いドローのチェックバック候補';
      policy='強いドローは打つ理由もありますが、相手が降りにくい時やチェックレイズが重い時はチェックで実現率を取りに行けます。';
      suggest='相手依存: bet/check の混合';
    }else{
      severity='good';verdict='無理に続けないチェック';
      policy=(turnMeaning&&turnMeaning.advice?turnMeaning.advice+' ':'')+'フロップで打ったあとでも、ターンで目的が薄くなればチェックで実現率とポット管理を優先します。';
      suggest='推奨: チェックで次の判断へ';
    }
  }
  text='フロップで打ってコールされた後のターン判断です。'+policy;
  return{axis:'ターンの継続ベット判断',lane,street:d.street,sizePct,transition,transitionLabel:texture.transitionLabel||'',turnMeaning,villainFlopCall,rangeGood,completed,blank,severity,verdict,policy,suggest,target,text,purpose:purposeProfile?purposeProfile.purpose:'',rangeState:rangeActionProfile?rangeActionProfile.rangeState:''};
}
function postflopBarrelPlanProfileText(p){
  if(!p)return'';
  return p.verdict+' — '+p.policy+' 対象: '+p.target+(p.sizePct?(' / サイズ='+p.sizePct+'%pot'):'');
}

// [Codex fix 2026-06-20] 相手のベットに対するフロップ/ターンの受け方を、必要EQだけでなく実現率で見る。
function postflopDefensePlanProfile(hr,d,role,texture,rangeActionProfile,opts){
  if(!hr||!d||d.street==='preflop'||d.street==='river')return null;
  const facing=!!((d.toCall||0)>0);
  if(!facing||!(d.action==='call'||d.action==='fold'))return null;
  opts=opts||{}; role=role||{}; texture=texture||{}; rangeActionProfile=rangeActionProfile||null;
  const basePot=Math.max(1,(d.pot||0)-(d.toCall||0));
  const sizePct=Math.round((d.toCall||0)/basePot*100);
  const isNut=!!(role.isNut||role.role==='nutted');
  const isStrong=!!(isNut||role.role==='strong');
  const strongOnePair=!!(role.pairTier&&(role.role==='strong'||role.role==='value'));
  const weakMade=!!(role.pairTier&&!strongOnePair&&!isStrong);
  const strongDraw=!!(role.draw&&role.draw.outs>=8&&d.street!=='river');
  const weakDraw=!!(role.draw&&role.draw.outs>0&&role.draw.outs<8&&d.street!=='river');
  const air=!!(role.role==='air'||/ハイカード|ドロー失敗/.test(role.note||''));
  const completed=texture.transition==='flush_complete_card'||texture.transition==='four_flush_card'||texture.transition==='straight_complete_card'||texture.transition==='board_pair'||texture.flushThreat&&texture.straightThreat;
  const dynamic=!!(texture.dynamic||texture.flushThreat||texture.straightThreat||texture.paired);
  const multiway=(opts.nOpponents||1)>=2;
  const oop=!!(opts.isOOP);
  const pressure=rangeActionProfile&&rangeActionProfile.pressure!=null?rangeActionProfile.pressure:beforeStreetAggressionCount(hr,d,false);
  let severity='border',verdict='受け方を確認',policy='',suggest='',target='相手のベットレンジ',text='';
  if(d.action==='call'){
    if(isStrong||isNut){
      severity='good';verdict='強い手の自然な継続';
      policy='強い完成役は、相手のベットに対してコールだけでなくレイズ候補も残します。サイズと相手レンジを見て取り切りを考える場面です。';
      suggest='推奨: 継続。相手が広く打つならレイズも検討';
      target='相手のバリューとブラフの両方';
    }else if(strongDraw){
      const tooBig=sizePct>=85||completed&&sizePct>=55||multiway&&sizePct>=65;
      severity=tooBig?'border':'good';
      verdict=tooBig?'強いドローでも価格は確認':'強いドローの自然なコール';
      policy='強いドローは、完成した時の勝ち筋と、相手が諦める未来があるため継続候補になります。ただし完成寄りボードやマルチウェイではインプライドを控えめに見ます。';
      suggest=tooBig?'相手依存: 大サイズはコール頻度を落とす':'推奨: コール中心。レイズはフォールドエクイティがある時だけ';
      target='相手のワンペア、強いドロー、CBレンジ';
    }else if(weakDraw){
      const bad=sizePct>=50||completed||multiway||oop;
      severity=bad?'bad':'border';
      verdict=bad?'弱いドローの受けすぎ':'安い弱ドローの境界コール';
      policy='弱いドローは、アウトが少ないうえに完成してもナッツになりにくいことがあります。安い時だけ受け、重いサイズではフォールドを混ぜます。';
      suggest=bad?'推奨: フォールド寄り。コールするなら明確なインプライドが必要':'相手依存: 小サイズだけ一部コール';
      target='相手の小さめCB';
    }else if(weakMade||strongOnePair){
      const bad=(weakMade&&(sizePct>=55||completed||pressure>=2||multiway))||(strongOnePair&&completed&&sizePct>=65);
      severity=bad?'bad':'border';
      verdict=bad?'ワンペア系の受けすぎ':'ワンペアの境界コール';
      policy='ワンペア系のコールは、今の勝率だけでなく次ストリートでさらに打たれた時に耐えられるかを見ます。完成寄りボード、大サイズ、複数ストリート圧力では受けすぎになりやすいです。';
      suggest=bad?'推奨: フォールド寄り。相手がブラフを作れる時だけコール':'相手依存: 小〜中サイズは一部コール、次の大きい圧力には慎重に';
      target='相手のCB、薄いバリュー、一部ブラフ';
    }else{
      severity='bad';verdict='空振りのコールしすぎ';
      policy='ショーダウン価値も改善率も薄い手でコールすると、ターン以降にさらに難しい判断を背負います。必要EQだけで正当化しない場面です。';
      suggest='推奨: フォールド';
      target='相手の広いCBでも受けにくい';
    }
  }else if(d.action==='fold'){
    if(isStrong||isNut){
      severity='bad';verdict='強い手の降りすぎ';
      policy='強い完成役は相手のベットに対して継続できます。フォールドすると、相手のブラフや薄いバリューをすべて成功させてしまいます。';
      suggest='推奨: コールまたはレイズ';
    }else if(strongDraw&&sizePct<=55&&!completed){
      severity='bad';verdict='強いドローの降りすぎ';
      policy='強いドローは、安い〜中サイズならコールして実現率を取りに行けます。すぐ降りると改善価値を捨てすぎます。';
      suggest='推奨: コール中心。相手が降りるならレイズも候補';
    }else if(weakMade&&(completed||sizePct>=55||pressure>=2)||weakDraw&&(completed||sizePct>=50)||air){
      severity='good';verdict='低実現率を捨てる良いフォールド';
      policy='相手のベットに対して、こちらの実現率が低い部分を捨てる判断です。完成寄りボードや大きいサイズでは、無理なコールを減らす方が長期的に安定します。';
      suggest='推奨: フォールドで問題ありません';
    }else{
      severity='border';verdict='境界フォールド';
      policy='降りても大きな問題はありませんが、相手のサイズが小さく、こちらにショーダウン価値や改善率がある時はコールも混ざります。';
      suggest='相手依存: コール/フォールドを混ぜる';
    }
  }
  text='相手のベットに対する受け方です。'+policy;
  return{axis:'ポストフロップの受け方',lane:d.action,street:d.street,sizePct,completed,dynamic,multiway,oop,pressure,severity,verdict,policy,suggest,target,text,strongDraw,weakDraw,weakMade,strongOnePair,isStrong,air};
}
function postflopDefensePlanProfileText(p){
  if(!p)return'';
  return p.verdict+' — '+p.policy+' サイズ='+p.sizePct+'%pot / 圧力='+p.pressure+'回';
}
// [Codex fix 2026-06-20] コール後に次ストリートで困るカードを先に言語化し、受けた後の計画を作る。
function postflopCallFuturePlanProfile(hr,d,role,texture,defenseProfile,opts){
  if(!hr||!d||d.street==='preflop'||d.street==='river'||d.action!=='call'||!((d.toCall||0)>0))return null;
  opts=opts||{}; role=role||{}; texture=texture||{}; defenseProfile=defenseProfile||null;
  const nextStreet=d.street==='flop'?'turn':'river';
  const scare=[];
  const good=[];
  const hasPair=!!role.pairTier;
  const isStrong=!!(role.isNut||role.role==='nutted'||role.role==='strong');
  const hasDraw=!!(role.draw&&role.draw.outs>0);
  const strongDraw=!!(role.draw&&role.draw.outs>=8);
  const weakDraw=!!(role.draw&&role.draw.outs>0&&role.draw.outs<8);
  const oop=!!opts.isOOP;
  const multiway=(opts.nOpponents||1)>=2;
  const sizePct=defenseProfile&&defenseProfile.sizePct!=null?defenseProfile.sizePct:Math.round((d.toCall||0)/Math.max(1,(d.pot||0)-(d.toCall||0))*100);
  if(texture.flushThreat)scare.push('同スート完成');
  if(texture.straightThreat)scare.push('連結完成');
  if(texture.dynamic)scare.push('強いオーバーカード');
  if(texture.paired)scare.push('ボードペア化');
  if(hasDraw)good.push('ドロー完成カード');
  if(hasPair&&!isStrong)good.push('安全なブランク');
  if(isStrong)good.push('相手が続けやすいブランク');
  let severity='border',verdict='次ストリート計画を持つコール',policy='',suggest='',plan='';
  if(isStrong){
    severity='good';
    verdict='強い手で計画のあるコール';
    policy='強い手で受ける時は、次の安全カードでバリューを取りに行きます。怖いカードでもすぐ諦めるのではなく、相手のサイズを見て取り切りとポット管理を分けます。';
    suggest='次の安全カードではコール継続かレイズ、危険カードではサイズを見て判断';
  }else if(strongDraw){
    severity=sizePct>=85||multiway?'border':'good';
    verdict='強いドローで先を見たコール';
    policy='強いドローのコールは、引けた時の取り切りと、引けなかった時に無理をしないことがセットです。ターンで改善しなければ、大きい2発目には頻度を落とします。';
    suggest='改善カードは続行。外れて大きく打たれたらフォールド寄り';
  }else if(weakDraw){
    severity='bad';
    verdict='弱いドローで先が苦しいコール';
    policy='弱いドローは、引けるカードが少なく、引けても強い完成役になりにくいことがあります。次も打たれると降りる場面が多いので、フロップ/ターンで安くないコールは苦しくなります。';
    suggest='次も大きく打たれる前提なら、今フォールド寄り';
  }else if(hasPair){
    const bad=sizePct>=55&&(texture.dynamic||texture.flushThreat||texture.straightThreat||oop||multiway);
    severity=bad?'bad':'border';
    verdict=bad?'ワンペアで次が苦しいコール':'ワンペアの慎重なコール';
    policy='ワンペアのコールは、今だけ勝っているかよりも、次に嫌なカードが落ちてもう一度打たれた時に続けられるかが大事です。嫌なカードが多いボードでは、受ける回数を減らします。';
    suggest=bad?'次ストリートの大きい圧力には降りる準備。今もフォールド寄り':'安全カードなら一部継続。危険カードと大サイズには慎重に';
  }else{
    severity='bad';
    verdict='空振りで計画不足のコール';
    policy='ショーダウン価値が薄い手で受けるなら、次にどのカードでブラフを続けるかが必要です。計画がないコールは、次のベットに押し出されやすくなります。';
    suggest='明確な改善カードやブラフ計画がなければフォールド';
  }
  const scareText=scare.length?scare.slice(0,3).join('・'):'大きな危険カードは少なめ';
  const goodText=good.length?good.slice(0,2).join('・'):'相手が止まるカード';
  plan='次の良いカード: '+goodText+'。嫌なカード: '+scareText+'。';
  return{axis:'コール後の次ストリート計画',street:d.street,nextStreet,severity,verdict,policy,suggest,plan,scareCards:scare,goodCards:good,sizePct,oop,multiway,strongDraw,weakDraw,hasPair,isStrong};
}
function postflopCallFuturePlanProfileText(p){
  if(!p)return'';
  return p.verdict+' — '+p.plan+' '+p.suggest;
}
