function liveCashRangeProfile(hr,d,holeCards,pos){
  if(!d||d.street!=='preflop'||!holeCards||holeCards.length<2)return null;
  const ht=handType(holeCards[0],holeCards[1]);
  const handFrac=HAND_COMBO_FRAC[ht]||0.99;
  const shape=simpleHandShape(holeCards[0],holeCards[1]);
  const totalP=hr.players.filter(function(p){return p.active!==false;}).length||hr.players.length||6;
  const before=hr.decisions.slice(0,hr.decisions.indexOf(d));
  const firstAgg=before.find(function(x){return x.street==='preflop'&&(x.action==='raise'||x.action==='allin');});
  const openerPos=firstAgg?firstAgg.position:null;
  // [feature 2026-06-10] プリフロップのモード/マルチウェイ連動。Live=$2/$5基準(現状維持)、GTOで3bet/flatを調整。
  const _pfMode=getRangeMode();
  const _aggIdx=firstAgg?before.indexOf(firstAgg):-1;
  const callersBetween=_aggIdx>=0?before.filter(function(x,i){return x.street==='preflop'&&x.action==='call'&&i>_aggIdx;}).length:0;
  const pct=x=>Math.round(Math.max(0,Math.min(1,x))*100);
  const facing=!!(d.facingRaise&&(d.toCall||0)>0);
  const raiseLike=d.action==='raise'||d.action==='allin';
  let lane='open',cap=live25OpenPct(pos,totalP),actionLabel='Open',baseline='$2/$5 live open';
  let chartKind='open';
  // [Codex fix 2026-06-06] 未参加フォールドはOpen候補ではなく、弱い手を降ろせたか/降りすぎかで判定する。
  if(!facing&&d.action==='fold'){lane='openFold';cap=live25OpenPct(pos,totalP);actionLabel='Open fold';baseline='ライブ$2/$5 open/fold判断';chartKind='open';}
  else if(!facing&&d.action==='call'){lane='limp';cap=0.06;actionLabel='Open limp';baseline='ライブ$2/$5では基本レイズ/フォールド';chartKind='open';}
  else if(facing&&pos==='BB'&&raiseLike){lane='bb3bet';cap=0.13+(shape.wheelAxs?0.05:0)+(shape.pair?0.03:0)+(_pfMode==='gto'?0.04:0);actionLabel='BB 3bet';baseline=_pfMode==='gto'?'BBの3bet(GTOは広め)':'BBの3bet/スクイーズ候補';chartKind='threeBet';}
  // [Claude fix 2026-06-09] BBフォールドはbbDefend(cap=0.50)でなくvsRaiseFoldに寄せる。cap=BBの実際のコールレンジ。
  else if(facing&&pos==='BB'&&d.action==='fold'){
    lane='vsRaiseFold';
    cap=0.45+(shape.suited?0.08:0)+(shape.pair?0.06:0)+(shape.suitedConnector?0.04:0);
    if(['UTG','UTG+1'].includes(openerPos||''))cap-=0.10;
    cap=Math.max(0.15,Math.min(0.70,cap));
    actionLabel='BB対レイズフォールド';baseline='BBディフェンス判断';
    chartKind='flat';
  }
  else if(facing&&pos==='BB'){lane='bbDefend';cap=0.50+(shape.suited?0.10:0)+(shape.pair?0.08:0)+(shape.suitedConnector?0.05:0);actionLabel='BB defend';baseline='BBディフェンス';chartKind='flat';}
  else if(facing&&raiseLike){
    lane=(d.pfActionBetLevel||0)>=5?'fiveBet':'threeBet';
    cap=lane==='fiveBet'?0.055:(0.08+(shape.wheelAxs?0.045:0)+(shape.suitedBroadway?0.025:0)+(shape.pair&&shape.lo>=7?0.03:0));
    if(pos==='BTN'&&['CO','HJ','LJ'].includes(openerPos||''))cap+=0.035;
    if(pos==='SB'||pos==='BB')cap+=0.015;
    let _3betCtx='';
    if(lane==='threeBet'){
      if(callersBetween>=1){
        // スクイーズ: コールド・コーラーが残るとブラフが通りにくい→バリュー寄せ(両モード)。Liveは特に締める。
        cap=Math.max(0.05,cap-(shape.wheelAxs?0.03:0)-(shape.suitedBroadway?0.015:0));
        _3betCtx='スクイーズ(バリュー寄せ)';
      }else if(_pfMode==='gto'){
        // GTOはブラフ3betを広く(ポラー)。スーテッドブロッカーを足す。
        cap+=0.035+(shape.suited?0.015:0);
        _3betCtx='GTO 3BET(ポラー)';
      }
    }
    actionLabel=lane==='fiveBet'?'5BET':'3BET';
    baseline=lane==='fiveBet'?'4BET後の継続レンジ':(_3betCtx||'ライブ$2/$5 3BET候補');
    chartKind='threeBet';
  }else if(facing&&d.action==='fold'){
    // [Claude fix 2026-06-08] 対レイズフォールドを'flat'と誤分類しないための専用レーン
    lane='vsRaiseFold';
    const earlyOpen_vrf=['UTG','UTG+1'].includes(openerPos||'');
    cap=pos==='BTN'?0.24:pos==='CO'?0.18:pos==='SB'?0.13:0.14;
    if(earlyOpen_vrf)cap-=shape.dominatedOffsuit?0.08:0.04;
    if(shape.suited)cap+=0.04;
    if(shape.pair)cap+=0.06;
    cap=Math.max(0.02,cap);
    actionLabel='対レイズフォールド';
    baseline=earlyOpen_vrf?'早いポジションのオープンへのフォールド':'レイズへのフォールド';
    chartKind='flat';
  }else if(facing){
    lane=pos==='SB'?'sbFlat':'flat';
    const earlyOpen=['UTG','UTG+1'].includes(openerPos||'');
    cap=pos==='BTN'?0.24:pos==='CO'?0.18:pos==='SB'?0.13:0.14;
    if(earlyOpen)cap-=shape.dominatedOffsuit?0.08:0.04;
    if(shape.suited)cap+=0.04;
    if(shape.pair)cap+=0.06;
    let _flatCtx='';
    if(_pfMode==='gto'){
      // GTOは非IPフラットを大幅圧縮(3bet-or-fold)。IPもやや締める。
      cap*=(pos==='SB'||pos==='BB')?0.55:0.72;
      _flatCtx='GTO(フラット圧縮・3bet/fold寄り)';
    }else if(callersBetween>=1){
      // ライブ・マルチウェイ: 投機ハンドは含み益UP、ドミネート系オフスートは更に締める。
      if(shape.suited||shape.pair||shape.suitedConnector)cap+=0.05;
      if(shape.dominatedOffsuit)cap-=0.05;
      _flatCtx='マルチウェイ(投機系広め/ドミネート系締め)';
    }
    cap=Math.max(0.02,cap);
    actionLabel=pos==='SB'?'SB flat':'Flat';
    baseline=earlyOpen?'早いポジションのオープンに対する低頻度フラット':(_flatCtx||'非BBフラット');
    chartKind='flat';
  }
  const chart=preflopChartLookup(chartKind,ht,pos,totalP,{openerPos,polar:lane==='threeBet'&&!callersBetween});
  if(chart&&chart.status==='pure'){
    const chartBoost=(_pfMode==='gto'&&chartKind==='threeBet')?0.085:(_pfMode==='gto'&&chartKind==='flat'?-0.015:0.04);
    if(chartKind==='flat'&&_pfMode==='gto')cap=Math.min(cap,Math.max(0.02,handFrac+chartBoost));
    else cap=Math.max(cap,Math.min(0.80,handFrac+chartBoost));
  }else if(chart&&chart.status==='mix'){
    const chartBoost=(_pfMode==='gto'&&chartKind==='threeBet')?0.055:(_pfMode==='gto'&&chartKind==='flat'?-0.025:0.015);
    if(chartKind==='flat'&&_pfMode==='gto')cap=Math.min(cap,Math.max(0.02,handFrac+chartBoost));
    else cap=Math.max(cap,Math.min(0.75,handFrac+chartBoost));
  }else if(chart&&chart.status==='out'){
    const outTrim=(_pfMode==='gto'&&chartKind==='flat')?0.085:0.06;
    cap=Math.min(cap,Math.max(0.01,handFrac-outTrim));
  }
  if(lane==='limp'){
    // リンプは「チャート内の強い手だから許容」ではなく、強い手ほどレイズしない損失が大きい。
    cap=0.06;
  }
  const margin=cap-handFrac;
  let verdict='自然',severity='good';
  if(lane==='openFold'){
    if(chart.status==='pure'){verdict='降りすぎ';severity='bad';}
    else if(chart.status==='mix'){verdict='境界フォールド';severity='border';}
    else if(handFrac<=Math.max(0,cap-0.09)){verdict='降りすぎ';severity='bad';}
    else if(handFrac<=cap+0.05){verdict='境界フォールド';severity='border';}
    else{verdict='自然なフォールド';severity='good';}
  }else if(lane==='vsRaiseFold'){
    // [Claude fix 2026-06-08] コールレンジ外なら自然なフォールド、範囲内なら降りすぎ
    if(chart.status==='pure'){verdict='降りすぎ';severity='bad';}
    else if(chart.status==='mix'){verdict='境界フォールド';severity='border';}
    else if(handFrac>cap+0.05){verdict='自然なフォールド';severity='good';}
    else if(handFrac>cap-0.05){verdict='境界フォールド';severity='border';}
    else{verdict='降りすぎ';severity='bad';}
  }else if(lane==='limp'){verdict=chart.status==='out'?'リンプ癖':'強い手のリンプ';severity='bad';}
  else if(chart.status==='pure'){verdict='チャート内';severity='good';}
  else if(chart.status==='mix'){verdict='混合候補';severity='border';}
  else if(margin<0&&handFrac<=cap+0.05){verdict='境界';severity='border';}
  else if(margin<0){verdict='レンジ外';severity='bad';}
  const notes=[];
  if(lane==='flat'&&shape.dominatedOffsuit)notes.push('オフスートブロードウェイはドミネートされやすい');
  if(lane==='sbFlat')notes.push('SBは全ストリートOOPで実現率が低い');
  if(lane==='fiveBet')notes.push('4BET後は元の3BETレンジより大幅に締める');
  if(chart&&chart.label)notes.push('参照レンジ: '+chart.label+' / '+chart.status);
  return{handType:ht,handPercent:pct(handFrac),position:pos,lane,actionLabel,baseline,capPercent:pct(cap),marginPercent:Math.round(margin*100),verdict,severity,openerPos,notes,mode:_pfMode,callersBetween,chart};
}
function rangeProfileText(profile){
  if(!profile)return'';
  if(profile.caps)return tournamentRangeProfileText(profile);
  const note=profile.notes&&profile.notes.length?' / '+profile.notes.join(' / '):'';
  return profile.handType+' 上位'+profile.handPercent+'%: '+profile.actionLabel+'目安 上位'+profile.capPercent+'% -> '+profile.verdict+'（'+profile.baseline+'）'+note;
}
// [Codex fix 2026-06-12] AI/相手の実ハンドを前提監査テキストに出さない。
// 非公開カード由来のハンド名・順位%は、コピー用レビューや監査ログではレンジ前提だけに丸める。
function rangeProfileTextForVisibility(profile,hideHand){
  if(!profile)return'';
  if(profile.caps)return tournamentRangeProfileText(profile);
  if(!hideHand)return rangeProfileText(profile);
  const note=profile.notes&&profile.notes.length?' / '+profile.notes.join(' / '):'';
  return '非公開ハンド: '+profile.actionLabel+'目安 上位'+profile.capPercent+'% -> '+profile.verdict+'（'+profile.baseline+'）'+note;
}
// [Codex fix 2026-06-05] Ring cash needs its own scene labels, separate from tournament phases.
function liveCashSpotProfile(hr,d,holeCards,role,tex,nOpponents,lineContext){
  if(!hr||!d||!holeCards||holeCards.length<2)return null;
  if(hr.tournamentContext&&hr.tournamentContext.enabled)return null;
  const street=d.street||'';
  const action=d.action||'';
  const pos=d.position||'';
  const facing=!!((d.toCall||0)>0&&(street!=='preflop'||d.facingRaise));
  const betLike=action==='raise'||action==='bet'||action==='allin';
  const betBase=d.toCall>0?Math.max(1,(d.pot||0)-d.toCall):(d.pot||0);
  const sizePct=betLike&&d.pot?Math.round((d.amount||0)/(d.pot||1)*100):(d.toCall&&betBase?Math.round(d.toCall/betBase*100):0);
  const pref=(hr.decisions||[]).filter(function(x){return x.street==='preflop';});
  const idx=(hr.decisions||[]).indexOf(d);
  const before=idx>=0?hr.decisions.slice(0,idx):[];
  const preBefore=street==='preflop'?pref.slice(0,pref.indexOf(d)):pref;
  const raises=preBefore.filter(function(x){return x.action==='raise'||x.action==='allin';});
  const allPreRaises=pref.filter(function(x){return x.action==='raise'||x.action==='allin';});
  const is3BetPot=allPreRaises.length>=2;
  const lastPfr=raises[raises.length-1]||null;
  const humanWasLastPfr=humanWasLastPreflopAggressor(hr);
  const heroOpenLimped=pref.some(function(x){return x.isHuman&&x.action==='call'&&!x.facingRaise&&(x.toCall||0)>0&&x.position!=='SB'&&x.position!=='BB';});
  const villainIsoAfterHeroLimp=pref.some(function(x){return !x.isHuman&&(x.action==='raise'||x.action==='allin')&&!x.facingRaise;});
  const limpIso=heroOpenLimped&&villainIsoAfterHeroLimp;
  const positionState=street==='preflop'?{isOOP:pos==='SB'||pos==='BB',isIP:pos==='BTN'}:postflopPositionState(hr,d);
  const isOOP=!!positionState.isOOP;
  const onePair=!!(role&&(role.pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(role.note||'')));
  const strongOnePair=!!(role&&(role.pairTier==='top_pair'||role.pairTier==='overpair')&&(role.role==='strong'||role.role==='value'));
  const strongMade=!!(role&&(role.isNut||role.role==='nutted'||(!onePair&&(role.role==='strong'||role.role==='value'))));
  const draw=!!(role&&role.draw);
  const dynamic=!!(tex&&(tex.dynamic||tex.flushy>=3||tex.connected>=3||tex.paired));
  const multiway=(nOpponents||1)>=2;
  const villainBetsBefore=before.filter(function(x){return !x.isHuman&&(x.action==='raise'||x.action==='bet'||x.action==='allin')&&x.street!=='preflop';}).length;
  let lane='',label='',axis='',verdict='自然',severity='good',policy='',risk='',suggest='',mix='';

  if(street==='preflop'){
    const rp=liveCashRangeProfile(hr,d,holeCards,pos);
    const rpBad=rp&&rp.severity==='bad';
    if(lineContext==='オープンリンプ'||(action==='call'&&!facing&&(d.toCall||0)>0&&pos!=='SB'&&pos!=='BB')){
      lane='openLimp';label='オープンリンプ';axis='リング参加レンジ';
      verdict=rpBad?'リンプ癖':'レイズ/フォールド整理';
      severity=rpBad?'bad':'border';
      policy='ライブ$2/$5でも、先に入る時はリンプではなくレイズかフォールドに整理します。リンプは後ろからアイソされ、ポジションを失ったまま難しいポットになりやすいです。';
      risk='BTN/COからアイソされると、トップペアを作ってもキッカー負けとOOP実現率が問題になります。';
      suggest='推奨: 参加するなら2.5〜3BBでオープン。迷うハンドはフォールド';
      mix='Raise 60-80% / Fold 20-40% / Limp 0-5%';
    }else if(limpIso&&action==='call'&&facing){
      lane='limpIsoCall';label='リンプ→アイソコール';axis='リング参加レンジ';
      verdict='受け身の参加';
      severity=rpBad?'bad':'border';
      policy='自分がリンプし、後ろからアイソされた後のコールは、必要EQよりも実現率の低さを重く見ます。';
      risk='BTN/COが主導権を持ち、こちらはOOPのリンプコール側です。ワンペアを作っても大きく勝ちにくく、降りにくい局面が増えます。';
      suggest='推奨: 基本フォールド。相手が極端に広い時だけ一部コール';
      mix='Fold 70-85% / Call 10-25% / 3bet 0-5%';
    }else if((lineContext==='3BET'||lineContext==='4BET'||lineContext==='5BET'||lineContext==='4BET対応コール'||lineContext==='4BET対応フォールド'||lineContext==='5BET以上対応コール'||lineContext==='5BET以上対応フォールド'||lineContext==='5BET以上対応'||lineContext==='6BET以上')&&rp){
      lane='reraisedPot';label=lineContext;axis='3BET/4BET文脈';
      verdict=rp.verdict;
      severity=rp.severity;
      policy='3BET前のハンド強度と、4BETを受けた後の継続価値は別物として扱います。';
      risk='ライブ$2/$5の4BETはブラフ不足になりやすく、ミドルペアやオフスーツBroadwayは急に価値が落ちます。';
      suggest=lineContext.indexOf('5BET')>=0?'推奨: 5BET以上のポットではAA/KK以外はほぼフォールド。継続するなら6BET jam':lineContext.indexOf('4BET対応')>=0?'推奨: 相手の4BETレンジを強く見て、QQ+/AK級以外は慎重に':'推奨: 相手位置に合わせて3BET/コール/フォールドを分ける';
    }else if(lineContext==='BBディフェンス'){
      lane='bbDefend';label='BBディフェンス';axis='BBディフェンス';
      verdict=rp?rp.verdict:'自然';
      severity=rp?rp.severity:'good';
      if(rp&&rp.severity==='bad'){
        const opener=rp.openerPos||'相手';
        policy='BBは広く守れますが、'+opener+'オープン相手ではレンジを締めます。今回の'+(rp.handType||'手')+'は上位'+rp.handPercent+'%程度で、BB防衛目安の上位'+rp.capPercent+'%から外れています。';
        risk='ポットオッズだけでコールすると、OOPでエクイティを実現しにくく、当たっても弱いトップペアやキッカー負けで払いすぎやすくなります。';
        suggest='推奨: フォールド。BTN/COの小さめオープン相手なら一部防衛しますが、UTGなど強いレンジ相手はかなり絞る';
      }else if(rp&&rp.severity==='border'){
        const opener=rp.openerPos||'相手';
        policy='BBなのでポットオッズは良いですが、'+opener+'のレンジと自分のハンドの実現率で判断が分かれる境界です。今回の'+(rp.handType||'手')+'は上位'+rp.handPercent+'%程度で、防衛目安の上位'+rp.capPercent+'%付近です。';
        risk='OOPなので、フロップ以降は弱いワンペアで大きく払いすぎないことが条件になります。';
        suggest='状況次第: 相手が広いならコール、強い/大きいオープンならフォールド寄り';
      }else{
        policy='BBはポットオッズが良く、非BBのコールドコールより広く守れます。今回の手は防衛レンジ内に収まりやすいです。';
        risk='ただしOOPなので、弱いトップペアやキッカー負けしやすい手はポストフロップで払いすぎないことが条件です。';
        suggest='推奨: 小さめBTN/COオープンには広めに防衛。EP相手や弱オフスーツは締める';
      }
    }else if(lineContext==='SBコールドコール'){
      lane='sbColdCall';label='SBコールドコール';axis='リング参加レンジ';
      verdict=rp?rp.verdict:'境界';
      severity=rp&&rp.severity==='good'?'border':(rp?rp.severity:'border');
      policy='SBは全ストリートOOPで、コールの実現率が最も低いポジションです。';
      risk='安いからコールに見えても、後でトップペアを降りられない初心者リークにつながります。';
      suggest='推奨: 3bet/fold中心。コールはスーテッド・ペア系を低頻度';
    }else if(rp&&rp.lane==='vsRaiseFold'){
      // [Claude fix 2026-06-08] 対レイズフォールド専用: 'flat'ラベルの誤表示を防ぐ
      lane='vsRaiseFold';label='対レイズフォールド';axis='リング参加レンジ';
      verdict=rp.verdict;severity=rp.severity;
      if(rp.severity==='bad'){
        policy='コールレンジ内のハンドを降りすぎています。このポジションではコールまたは3BETも検討できます。';
        risk='有利なオッズやハンドEQを生かせる機会を逃しています。';
        suggest='推奨: コールまたは3BETを検討';
      }else if(rp.severity==='border'){
        policy='コールかフォールドかボーダーラインの場面です。相手のレンジとポジションで判断が分かれます。';
        risk='ポットオッズとポジションを考慮してコール/フォールドを使い分けます。';
        suggest='状況次第: コール低頻度またはフォールド';
      }else{
        policy='レイズに対してコールできる手は限られます。コールレンジ外の手にフォールドするのは適切な判断です。';
        risk='コールレンジ外の手はポットに参加してもトップペアでキッカー負けや実現率の低下が問題になりやすいです。';
        suggest='推奨: フォールドで問題ありません';
      }
    }else if(rp&&rp.lane==='openFold'){
      lane='openFold';label='未参加フォールド';axis='リング参加レンジ';
      verdict=rp.verdict;severity=rp.severity;
      if(rp.severity==='bad'){
        // [Claude fix 2026-06-08] 明確にオープンすべきハンドを折っている
        policy='このポジションなら十分オープンできる手を降ろしすぎています。';
        risk='後ろのプレイヤーにブラインドを渡しすぎると、CO/BTNでの収益機会を逃します。';
        suggest='推奨: 2.5〜3BBでオープン。卓がタイトなら広めに取る';
      }else if(rp.severity==='border'){
        // [Claude fix 2026-06-08] 境界ハンドのフォールドはオープン寄りのテキストを使う（「フォールドで問題ない」は誤誘導）
        policy='このポジションのオープンレンジ付近のハンドです。参加するならリンプでなくレイズで先手を取ります。';
        risk='コールやリンプでは後ろからアイソされ、ポジション不利のまま難しいポストフロップになりやすいです。';
        suggest='推奨: 2.5〜3BBでオープン検討。ポジションと卓傾向次第';
      }else{
        policy='参加レンジ外の手はコールやリンプをせずにフォールドするのが長期的に安定します。';
        risk='コールやリンプで参加してもトップペアでキッカー負けやOOP実現率の悪さに悩まされやすいです。';
        suggest='推奨: フォールドで問題ありません。参加レンジ外は無理に触らない';
      }
    }else if(rp){
      lane=rp.lane;label=rp.actionLabel;axis='リング参加レンジ';
      verdict=rp.verdict;severity=rp.severity;
      policy=rp.baseline+'として、ハンドの見た目よりポジションと実現率を優先します。';
      risk=(rp.notes&&rp.notes.length)?rp.notes.join('。'):'$2/$5ではルースコールが多いほど、先手とポジションの価値が上がります。';
      suggest=rp.severity==='bad'?'推奨: レンジを締める。参加するならレイズ/3bet側に整理':'この頻度なら許容範囲です';
    }
  }else if(street==='flop'||street==='turn'||street==='river'){
    if(limpIso&&isOOP&&action==='check'&&!humanWasLastPfr){
      lane='limpIsoOopCheck';label='OOPチェック';axis='チェック頻度と主導権';
      verdict='自然なチェック';severity='good';
      policy='リンプ→アイソコール側はレンジもナッツも不利です。トップペアを持っていても、まずチェックで相手のレンジに話させる形が自然です。';
      risk='ドンクで大きく打つと、強いレンジにだけ続けられやすく、こちらの中程度ハンドが苦しくなります。';
      suggest='推奨: チェック。相手のサイズを見てコール/フォールドを選ぶ';
    }else if(is3BetPot&&isOOP&&!humanWasLastPfr&&(onePair||role&&role.role==='medium'||role&&role.role==='air')){
      lane='threeBetPotOop';label='3BETポットOOP';axis='3BETポット';
      const facingBet=facing||action==='call'||action==='fold';
      verdict=facingBet?'実現率重視':'慎重なポット管理';
      // [Claude fix 2026-06-09] 3BETポットOOPでのコール: エアー→'bad'、弱ワンペア→'border'、強ワンペア以上→'good'
      severity=facingBet&&action==='call'?(role&&role.role==='air'?'bad':onePair&&!strongOnePair?'border':'good'):'good';
      policy='3BETポットでOOPの受け側は、プリフロップの相手レンジが強く、Raw EQより実現率を低く見ます。';
      risk='アンダーペアや弱いワンペアは、安いベットでも後続ストリートで大きな圧力を受けやすいです。';
      suggest=facingBet?'推奨: 小サイズだけ一部継続。ターン以降はフォールド寄りを混ぜる':'推奨: チェック中心。主導権側のCB頻度とサイズを見る';
    }else if(isOOP&&betLike&&!humanWasLastPfr&&!strongMade&&d.toCall===0){
      lane='oopDonk';label='OOPリード';axis='チェック頻度と主導権';
      verdict='ドンク過多';severity=draw&&role.draw&&role.draw.outs>=8?'border':'bad';
      policy='プリフロップ主導権がないOOP側は、強い根拠がなければドンクベットを低頻度にします。';
      risk='相手がレンジ優位を持つため、弱いペアやエアーで先に打つとチェックレンジが壊れます。';
      suggest='推奨: チェック中心。強いコンボドローだけ小〜中サイズを混ぜる';
    }else if(street==='river'&&action==='call'&&onePair&&!strongMade){
      lane='riverOnePairCall';label='リバーワンペア受け';axis='リバーのコール/フォールド';
      const heavy=sizePct>=65||villainBetsBefore>=2||dynamic;
      verdict=heavy?'受けすぎ注意':'相手依存';
      severity=heavy?'bad':'border';
      policy='ライブ$2/$5のリバーは、特に完成ボードや複数ストリート圧力が入った後ほどバリュー過多になりやすいです。';
      risk='ワンペアはショーダウン価値がありますが、大きいベットを受けた瞬間にブラフキャッチへ格下げします。';
      suggest=heavy?'推奨: フォールド寄り。相手が明確にブラフ過多の時だけコール':'相手依存: アグレッシブ相手はコール、パッシブ相手はフォールド寄り';
    }else if(street==='river'&&betLike&&onePair&&!strongMade){
      lane='riverThinValue';label='リバー薄バリュー';axis='リバーのバリュー/ブラフサイズ';
      const tooBig=sizePct>=65||(dynamic&&sizePct>=50);
      verdict=tooBig?'サイズ過多':'薄バリュー候補';
      severity=tooBig?'border':'good';
      policy='ワンペアのリバー薄バリューは、下のペアや弱いTx/Qxにコールしてもらうための小〜中サイズが基本です。';
      risk='大きく打つほど、悪い手は降り、強い手だけが残ります。';
      suggest=tooBig?'推奨: 35〜55%pot、またはチェック':'推奨: 小〜中サイズで薄く取る';
    }else if(multiway&&betLike&&!strongMade&&!draw){
      lane='multiwayPressure';label='マルチウェイ';axis='マルチウェイ';
      verdict='頻度を絞る';severity='border';
      policy='マルチウェイではブラフ頻度と薄いバリュー頻度を落とします。';
      risk='複数人に同時に降りてもらう必要があり、誰かにコールされる確率が高くなります。';
      suggest='推奨: チェック多め。打つなら小さめでレンジを保つ';
    }
  }
  if(!lane)return null;
  return{lane,label,axis,verdict,severity,policy,risk,suggest,mix,sizePct,position:pos,multiway,limpIso,is3BetPot,onePair,strongOnePair,dynamic,villainBetsBefore};
}
function liveCashSpotProfileText(profile){
  if(!profile)return'';
  return profile.label+' / '+profile.verdict+'：'+profile.policy+' '+profile.risk;
}
// [Codex fix 2026-06-05] Ring cash one-pair decisions need stack-depth context, not only raw hand strength.
function liveCashSprProfile(hr,d,role,tex,nOpponents){
  if(!hr||!d||hr.tournamentContext&&hr.tournamentContext.enabled)return null;
  if(d.street==='preflop')return null;
  const spr=calcSPR(d.playerChipsBefore||0,d.pot||0);
  const bb=hr.bigBlind||1;
  const stackBB=Math.round(((d.playerChipsBefore||0)/bb)*10)/10;
  const action=d.action||'';
  const betLike=action==='raise'||action==='bet'||action==='allin';
  const facing=(d.toCall||0)>0;
  const betBase=d.toCall>0?Math.max(1,(d.pot||0)-d.toCall):(d.pot||0);
  const sizePct=betLike&&d.pot?Math.round((d.amount||0)/(d.pot||1)*100):(d.toCall&&betBase?Math.round(d.toCall/betBase*100):0);
  const onePair=!!(role&&(role.pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(role.note||'')));
  const weakPair=!!(onePair&&!['top_pair','overpair'].includes(role.pairTier||''));
  const strongOnePair=!!(onePair&&['top_pair','overpair'].includes(role.pairTier||'')&&(role.role==='strong'||role.role==='value'));
  const strongMade=!!(role&&(role.isNut||role.role==='nutted'||(!onePair&&(role.role==='strong'||role.role==='value'))));
  const draw=role&&role.draw?role.draw:null;
  const strongDraw=!!(draw&&((draw.outs||0)>=8||role.dynamic));
  const dynamic=!!(tex&&(tex.dynamic||tex.flushy>=3||tex.connected>=3||tex.paired));
  const multiway=(nOpponents||1)>=2;
  let lane='',verdict='',severity='border',policy='',risk='',suggest='';
  if(spr>=7&&onePair&&!strongMade&&(action==='call'||action==='fold')&&facing){
    lane='deepSprOnePairCall';
    const heavy=sizePct>=55||dynamic||multiway||weakPair;
    verdict=heavy?'深いSPRでは受けすぎ注意':'相手依存のブラフキャッチ';
    severity=heavy&&action==='call'?'bad':action==='fold'?'good':'border';
    policy='深いSPRではワンペアの絶対価値が下がります。大きなポットを作るほど、相手の強いレンジに捕まりやすくなります。';
    risk='トップペアでもクラブなし・ストレート完成カード・マルチウェイなどが重なると、必要勝率だけではコールを正当化しにくいです。';
    suggest=heavy?'推奨: 相手が強く打つラインではフォールド寄り。コールするなら相手がブラフを作れるタイプに限定':'推奨: 小さめのベットにはコール可。大きいサイズや複数ストリートの圧力には慎重に';
  }else if(spr>=7&&onePair&&!strongMade&&betLike){
    lane='deepSprOnePairBet';
    const tooBig=sizePct>=65||(dynamic&&sizePct>=50)||weakPair;
    verdict=tooBig?'深いSPRのワンペアで大きく打ちすぎ':'薄いバリューはサイズ選び';
    severity=tooBig?'bad':'border';
    policy='深いSPRのワンペアは、バリューよりもポット管理の価値が上がります。打つなら下のペアやドローに払わせる小〜中サイズが中心です。';
    risk='大きく打つほど弱いハンドは降り、強いハンドだけに続けられやすくなります。';
    suggest=tooBig?'推奨: チェック、または25〜40%potの薄いバリュー/プロテクション':'推奨: 小〜中サイズで薄く取る。レイズされたらかなり慎重に';
  }else if(spr>=7&&onePair&&!strongMade&&action==='check'){
    lane='deepSprPotControl';
    verdict='深いSPRの自然なポット管理';
    severity='good';
    policy='深いSPRではワンペアのチェックが有効な選択肢です。相手の弱いレンジにベットさせ、強いレンジへ過剰に払わないためです。';
    risk='チェックは弱さではなく、将来の大きなベットに備えてポットを整理する選択です。';
    suggest='推奨: チェックで進め、相手のサイズとラインを見てコール/フォールドを分ける';
  }else if(spr>=7&&draw&&!strongDraw&&!strongMade&&(betLike||action==='call')){
    lane='deepSprDrawPressure';
    const loose=sizePct>=65||multiway;
    verdict=loose?'深いSPRの弱ドローで払いすぎ':'弱ドローは価格重視';
    severity=loose?'bad':'border';
    policy='深いSPRで弱いドローだけを理由に大きなベットへ付いていくと、完成しない時の損失が大きくなります。';
    risk='インプライドがありそうに見えても、完成時に相手が払わない・上位役に負ける場面があります。';
    suggest=loose?'推奨: 小さいサイズだけ継続。大きいサイズやマルチウェイではフォールド寄り':'推奨: 価格が合う時だけコール。自分から大きく膨らませない';
  }else if(spr<=3&&(strongOnePair||strongMade||strongDraw)&&(action==='call'||betLike||action==='fold')&&!(d.street==='river'&&dynamic&&action==='call'&&facing)){
    lane='lowSprCommit';
    verdict=action==='fold'?'浅いSPRで降りすぎ注意':'浅いSPRではコミット寄り';
    severity=action==='fold'?'border':'good';
    policy='SPRが低い時は、トップペア強キッカー・オーバーペア・強いドローの価値が上がります。残りスタックが少なく、後続判断の難しさも小さくなります。';
    risk='深い時ほどセットや2ペアを怖がりすぎると、浅いSPRで必要な継続を逃します。';
    suggest=action==='fold'?'推奨: 相手レンジとサイズを見直し、トップペア級以上はコール/オールイン継続を検討':'推奨: コールまたはオールインまで許容。弱いワンペアとは区別する';
  }
  if(!lane)return null;
  return{lane,label:'SPR/有効スタック',axis:'有効スタック/SPR',spr,stackBB,sizePct,onePair,weakPair,strongOnePair,strongMade,draw:!!draw,strongDraw,dynamic,multiway,severity,verdict,policy,risk,suggest};
}
function liveCashSprProfileText(profile){
  if(!profile)return'';
  return 'SPR '+profile.spr+' / '+profile.verdict+'：'+profile.policy+' '+profile.risk;
}
// [Codex fix 2026-06-17] フロップトレーニングではプリフロップ実履歴が省略されるため、pfStoryから最後のプリフロップ主導権を補完する。
function humanWasLastPreflopAggressor(hr){
  if(!hr)return false;
  const pref=(hr.decisions||[]).filter(function(x){return x.street==='preflop';});
  const lastPfr=[...pref].reverse().find(function(x){return x.action==='raise'||x.action==='allin';})||null;
  if(lastPfr)return !!lastPfr.isHuman;
  const story=String(hr.pfStory&&hr.pfStory.narrative||'');
  if(!story)return false;
  const parts=story.split(/→/).map(function(x){return x.trim();});
  let lastAgg='';
  parts.forEach(function(part){
    if(/オープン|レイズ|3BET|4BET|5BET|オールイン|all-?in|raise|open/i.test(part)&&!/コール|call/i.test(part)){
      lastAgg=part;
    }
  });
  return !!(lastAgg&&/あなた/.test(lastAgg));
}
// [Codex fix 2026-06-05] Initiative and position are a separate live-cash axis from raw equity or stack depth.
function liveCashInitiativeProfile(hr,d,role,tex,nOpponents){
  if(!hr||!d||hr.tournamentContext&&hr.tournamentContext.enabled)return null;
  if(d.street==='preflop')return null;
  const pref=(hr.decisions||[]).filter(function(x){return x.street==='preflop';});
  const lastPfr=[...pref].reverse().find(function(x){return x.action==='raise'||x.action==='allin';})||null;
  const humanWasPfr=humanWasLastPreflopAggressor(hr);
  const posState=postflopPositionState(hr,d);
  const isOOP=!!(posState&&posState.isOOP);
  const isIP=!!(posState&&posState.isIP);
  const action=d.action||'';
  const betLike=action==='raise'||action==='bet'||action==='allin';
  const facing=(d.toCall||0)>0;
  const multiway=(nOpponents||1)>=2;
  const dynamic=!!(tex&&(tex.dynamic||tex.flushy>=3||tex.connected>=3||tex.paired));
  const dryHigh=!!(tex&&tex.high&&tex.flushy<2&&tex.connected<2&&!tex.paired);
  const onePair=!!(role&&(role.pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(role.note||'')));
  const strongOnePair=!!(onePair&&['top_pair','overpair'].includes(role.pairTier||'')&&(role.role==='strong'||role.role==='value'));
  const strongMade=!!(role&&(role.isNut||role.role==='nutted'||(!onePair&&(role.role==='strong'||role.role==='value'))));
  const draw=role&&role.draw?role.draw:null;
  const strongDraw=!!(draw&&((draw.outs||0)>=8||role.dynamic));
  let lane='',verdict='',severity='border',policy='',risk='',suggest='';
  if(!humanWasPfr&&isOOP&&action==='check'){
    lane='oopNoInitiativeCheck';
    verdict='主導権なしOOPの自然なチェック';
    severity='good';
    policy='プリフロップで主導権がないOOP側は、強そうに見える一枚役でもまずチェックから入る場面が多いです。';
    risk='先に打つとレンジ全体が弱くなり、相手のCBやレイズに対して苦しい形を作りやすくなります。';
    suggest='推奨: まずチェック。相手のCBサイズを見て、コール/フォールド/チェックレイズを分ける';
  }else if(!humanWasPfr&&isOOP&&betLike&&!strongMade&&d.toCall===0){
    lane='oopNoInitiativeDonk';
    const allow=strongDraw||dynamic&&strongOnePair;
    verdict=allow?'低頻度なら成立するOOPリード':'主導権なしのドンク過多';
    severity=allow?'border':'bad';
    policy='主導権がないOOPからのドンクは、相手のレンジ優位を崩せる理由がある時だけ低頻度で使います。';
    risk='弱いペアやエアーで先に打つと、強いレンジにコール/レイズされ、チェックレンジも守れなくなります。';
    suggest=allow?'推奨: 小〜中サイズで低頻度。強いドローや明確なプロテクション目的に限定':'推奨: チェック中心。相手のCBに対して対応する';
  }else if(humanWasPfr&&betLike&&!facing){
    lane='pfrCbet';
    const tooWide=multiway&&!strongMade&&!strongDraw||dynamic&&!strongMade&&!strongDraw&&!strongOnePair;
    verdict=tooWide?'CB頻度を落とす場面':'PFR側の自然なCB';
    severity=tooWide?'border':'good';
    policy='PFR側はレンジ主導権を持ちますが、マルチウェイや動的ボードでは自動CBではなく、強い手・強いドロー・明確なレンジ優位に寄せます。';
    risk='何でもCBすると、コールされた後にターンで苦しくなり、$2/$5のルースコール相手にバレルしすぎます。';
    suggest=tooWide?'推奨: チェック頻度を増やす。打つなら25〜50%pot中心':'推奨: 25〜50%potのCBが自然。相手が降りない卓ではバリュー寄りに';
  }else if(humanWasPfr&&action==='check'){
    lane='pfrCheck';
    const natural=isOOP||multiway||dynamic&&!strongMade&&!strongDraw||!strongMade&&!dryHigh;
    verdict=natural?'PFR側でも自然なチェック':'CB取り逃し候補';
    severity=natural?'good':'border';
    if(isIP&&!multiway){
      policy='PFRでも毎回CBではありません。IP/HUでは小さなCBも使えますが、弱めのワンペアや中程度のSDVはチェックバックで実現率を上げる選択も自然です。';
    }else if(isOOP&&!multiway){
      policy='PFRでも毎回CBではありません。OOPではチェックを混ぜて、相手のベットサイズを見てから続行判断を分ける価値があります。';
    }else if(multiway){
      policy='PFRでも毎回CBではありません。マルチウェイでは誰かが強い手やドローを持つ頻度が上がるため、チェックでレンジを守る価値があります。';
    }else{
      policy='PFRでも毎回CBではありません。動的ボードや中程度の手では、チェックでターン以降の判断を楽にする価値があります。';
    }
    risk=natural?'チェックは弱さではなく、後続ストリートの難しさを下げる選択です。':'ドライなレンジ有利ボードでチェックしすぎると、相手のエクイティを無料で実現させます。';
    suggest=natural?'推奨: チェックを許容。相手のベットサイズで続行判断':'推奨: 小さめCBを混ぜる。25〜33%potから始める';
  }else if(!humanWasPfr&&isIP&&action==='check'){
    lane='ipFloatCheck';
    verdict='IP受け側の自然なチェックバック';
    severity='good';
    policy='IPの受け側は、相手のチェックに対して全て打つ必要はありません。中程度のSDVや弱いドローはチェックバックで実現率を上げます。';
    risk='無理に打つとチェックレイズやターン以降の大きいポットで苦しくなります。';
    suggest='推奨: SDVはチェックバック多め。強いバリューと良いドローでベットを作る';
  }else if(!humanWasPfr&&isIP&&betLike&&!strongMade&&!strongDraw){
    lane='ipStab';
    verdict='IPスタブ頻度注意';
    severity=dynamic||multiway?'border':'good';
    policy='IPで相手がチェックした時のスタブは有効ですが、ボードが重い時やマルチウェイでは頻度を落とします。';
    risk='弱すぎるスタブは、$2/$5のコール過多相手にすぐ捕まりやすいです。';
    suggest='推奨: ドライボードは小さく刺す。重いボードや複数人相手はチェック多め';
  }
  if(!lane)return null;
  return{lane,label:'主導権/ポジション',axis:'チェック頻度と主導権',humanWasPfr,isOOP,isIP,multiway,dynamic,onePair,strongOnePair,strongMade,strongDraw,severity,verdict,policy,risk,suggest};
}
function liveCashInitiativeProfileText(profile){
  if(!profile)return'';
  return profile.verdict+'：'+profile.policy+' '+profile.risk;
}
// [Codex fix 2026-06-06] Ring 3BET/4BET pots need their own context so preflop entry value is not confused with 4BET response value.
function liveCashReraisedPotProfile(hr,d,holeCards,role,tex,nOpponents,lineContext){
  if(!hr||!d||hr.tournamentContext&&hr.tournamentContext.enabled)return null;
  const pref=(hr.decisions||[]).filter(function(x){return x.street==='preflop';});
  const raises=pref.filter(function(x){return x.action==='raise'||x.action==='allin';});
  const lastRaise=raises[raises.length-1]||null;
  const humanWasLastPfr=!!(lastRaise&&lastRaise.isHuman);
  const action=d.action||'';
  const street=d.street||'preflop';
  const facing=(d.toCall||0)>0;
  const betLike=action==='raise'||action==='bet'||action==='allin';
  const actionLevel=d.pfActionBetLevel||0;
  const facingLevel=d.pfFacingBetLevel||0;
  const isPreflop=street==='preflop';
  const raiseCount=isPreflop?(d.pfRaiseCountBefore||0):raises.length;
  const is3BetContext=raiseCount>=2||actionLevel>=3||facingLevel>=3||/3BET|4BET|5BET/.test(lineContext||'');
  const is4BetContext=raiseCount>=3||actionLevel>=4||facingLevel>=4||/4BET|5BET/.test(lineContext||'');
  if(!is3BetContext)return null;
  const posState=isPreflop?{isOOP:['SB','BB','UTG','UTG+1','MP'].includes(d.position||''),isIP:['CO','BTN'].includes(d.position||'')}:postflopPositionState(hr,d);
  const isOOP=!!(posState&&posState.isOOP);
  const spr=isPreflop?null:calcSPR(d.playerChipsBefore||0,d.pot||0);
  const ht=holeCards&&holeCards.length>=2?handType(holeCards[0],holeCards[1]):'';
  const hRank=HAND_STRENGTH[ht]||169;
  const premium=hRank<=6||/^(AA|KK)$/.test(ht);
  const premiumContinue=hRank<=10||/^(AA|KK|QQ|AKs|AKo)$/.test(ht);
  const midPair=/^(JJ|TT|99|88|77|66|55)$/.test(ht);
  const onePair=!!(role&&(role.pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(role.note||'')));
  const strongOnePair=!!(onePair&&['top_pair','overpair'].includes(role.pairTier||'')&&(role.role==='strong'||role.role==='value'));
  const strongMade=!!(role&&(role.isNut||role.role==='nutted'||(!onePair&&(role.role==='strong'||role.role==='value'))));
  const draw=role&&role.draw?role.draw:null;
  const strongDraw=!!(draw&&((draw.outs||0)>=8||role.dynamic));
  const dynamic=!!(tex&&(tex.dynamic||tex.flushy>=3||tex.connected>=3||tex.paired));
  const multiway=(nOpponents||1)>=2;
  const betBase=d.toCall>0?Math.max(1,(d.pot||0)-d.toCall):(d.pot||0);
  const sizePct=betLike&&d.pot?Math.round((d.amount||0)/(d.pot||1)*100):(d.toCall&&betBase?Math.round(d.toCall/betBase*100):0);
  let lane='',verdict='',severity='border',policy='',risk='',suggest='',mix='',label='3BET/4BETポット';
  if(isPreflop&&actionLevel===3&&betLike){
    lane='threeBetEntry';verdict='3BET候補の切り分け';severity='border';
    policy='3BETは相手のオープンに対する攻撃で、参加前のハンド価値を見ます。ここでの評価と、4BETを返された後に継続できるかは別問題です。';
    risk='ライブ$2/$5ではコールされやすいので、弱いオフスーツやドミネートされる手で3BETしすぎると、ポストフロップで難しいSPRを作ります。';
    suggest='推奨: バリュー寄りを中心に、Axsや一部ポケットを相手位置に応じて混ぜる。4BETにはレンジを一段締める';
    mix='Value 60-75% / Bluff 25-40% / 4BET facingは別判定';
  }else if(isPreflop&&facingLevel<4&&raiseCount<3&&actionLevel<5&&(facingLevel>=3||raiseCount>=2)&&(action==='call'||action==='fold'||betLike)){
    lane='threeBetResponse';label='3BET対応';
    if(action==='fold'){
      verdict=premiumContinue?'強い手の3BETフォールドは相手依存':'自然な3BETフォールド';
      severity=premiumContinue?'border':'good';
      suggest=premiumContinue?'推奨: QQ+/AK級は相手の3BET頻度とサイズ次第でコール/4BETも検討':'推奨: ドミネートされやすいオフスートや小さめのペアはフォールド寄り';
    }else if(action==='call'){
      verdict=premiumContinue?'3BETコール許容':'3BETコールしすぎ注意';
      severity=premiumContinue?'good':(midPair?'border':'bad');
      suggest=premiumContinue?'推奨: コール/4BETを相手傾向で分ける':'推奨: OOPやドミネートされる手はフォールド寄り。コールはポジションと実現率がある時に限定';
    }else{
      verdict=premiumContinue?'4BET候補':'4BET押し返しすぎ注意';
      severity=premiumContinue?'good':'bad';
      suggest=premiumContinue?'推奨: バリュー中心に4BET。AK/QQは相手次第でコールも残す':'推奨: 3BETに対して広く押し返さず、フォールドとコールに整理';
    }
    policy='自分のオープン後に3BETを受けたら、最初のオープンレンジではなくvs3BETの継続レンジで見ます。コールできる手、4BETする手、降りる手を分けます。';
    risk='3BETポットはSPRが下がるため、ドミネートされる手やOOPのコールは見た目より実現率が落ちます。';
    mix=premiumContinue?'Fold 0-20% / Call 40-70% / 4BET 20-50%':midPair?'Fold 45-75% / Call 20-45% / 4BET 0-10%':'Fold 70-95% / Call 0-25% / 4BET 0-5%';
  }else if(isPreflop&&facingLevel>=4&&(action==='call'||action==='fold'||betLike)){
    lane='fourBetResponse';label='4BET対応';
    if(action==='fold'){
      verdict=premiumContinue?'強い手のフォールドは相手依存':'自然な4BETフォールド';
      severity=premiumContinue?'border':'good';
      suggest=premiumContinue?'推奨: QQ+/AK級は相手の4BET頻度でコール/5BETも検討':'推奨: ミドルペアやオフスーツBroadwayは基本フォールド';
    }else if(action==='call'){
      verdict=premium?'4BETコール許容':'4BETコールしすぎ注意';
      severity=premium?'good':'bad';
      suggest=premium?'推奨: AA/KK中心に継続。QQ/AKは相手次第':'推奨: フォールド寄り。コールするならQQ+/AK級か明確な相手読みが必要';
    }else{
      verdict=premium?'5BET/オールイン候補':'5BET押し返しすぎ注意';
      severity=premium?'good':'bad';
      suggest=premium?'推奨: AA/KKは基本スタックオフ候補':'推奨: 4BETレンジを強く見て、広い3BET感覚で押し返さない';
    }
    policy='4BETを受けた後は、元の3BETレンジよりかなり狭い継続レンジで見ます。必要EQだけでなく、相手レンジの強さとインプライドなしを重く扱います。';
    risk='ライブ$2/$5の4BETはブラフ不足になりやすく、特にミドルペアはセットマインの余地が消えるため見た目より大きく価値が落ちます。';
    mix=premium?'Fold 0-10% / Call 40-70% / 5BET 30-60%':midPair?'Fold 80-98% / Call 0-15% / 5BET 0-5%':'Fold 65-90% / Call 5-25% / 5BET 0-10%';
  }else if(isPreflop&&actionLevel>=5&&betLike){
    lane='fiveBetDecision';label='5BET判断';
    verdict=premium?'5BET候補':'5BET過多注意';
    severity=premium?'good':'bad';
    policy='5BETは4BETへの最終的な継続判断です。3BETできる手と5BETできる手は同じではありません。';
    risk='ライブ$2/$5では4BETレンジが強く、ブロッカーだけで押し返すと大きな損失になりやすいです。';
    suggest=premium?'推奨: AA/KK中心にスタックオフ。QQ/AKは相手頻度次第':'推奨: フォールド。Axsブラフやミドルペアの5BETはかなり慎重に';
    mix=premium?'Fold 0-10% / Call 20-50% / 5BET 40-80%':'Fold 80-98% / Call 0-15% / 5BET 0-5%';
  }else if(!isPreflop&&!humanWasLastPfr&&isOOP){
    lane='threeBetCallerOop';label=is4BetContext?'4BETポットOOP受け':'3BETポットOOP受け';
    const marginal=onePair&&!strongOnePair&&!strongMade||role&&role.role==='medium'||role&&role.role==='air';
    if(action==='check'){
      verdict='OOP受け側の自然なチェック';severity='good';
      suggest='推奨: まずチェック。相手のCBサイズに対してコール/フォールド/チェックレイズを分ける';
    }else if(action==='call'||action==='fold'){
      verdict=marginal&&action==='call'?'3BETポットの継続しすぎ注意':marginal&&action==='fold'?'実現率を見た自然なフォールド':'サイズ依存の受け';
      severity=marginal&&action==='call'&&(dynamic||sizePct>=45)?'bad':marginal&&action==='fold'?'good':'border';
      suggest=severity==='bad'?'推奨: ターン以降はフォールド寄り。小さいCBだけ一部コール':action==='fold'?'推奨: 下ペアや弱いSDVは無理に守らずフォールド寄り':'推奨: 小さいCBは一部コール、複数ストリートはレンジを締める';
    }else{
      verdict=marginal&&!strongDraw?'OOPから主導権を取り返しすぎ':'強い手/強いドローなら攻められる';
      severity=marginal&&!strongDraw?'bad':'border';
      suggest=severity==='bad'?'推奨: チェック中心。ドンク/リードは強いコンボか明確なレンジ優位に限定':'推奨: 強い手・強いドローは小〜中サイズを混ぜる';
    }
    policy='3BETポットでOOPの受け側は、Raw EQより実現率を低く見ます。相手がプリフロップの主導権を持つため、ワンペアや弱いドローは慎重に扱います。';
    risk='ポットが大きいぶん「当たったから降りない」になりやすいですが、後続ストリートで大きなプレッシャーを受けます。';
  }else if(!isPreflop&&humanWasLastPfr){
    lane='threeBetAggressor';label=is4BetContext?'4BET側ポストフロップ':'3BET側ポストフロップ';
    if(betLike&&!facing){
      const overCbet=multiway&&!strongMade&&!strongDraw||dynamic&&!strongMade&&!strongDraw&&!strongOnePair;
      verdict=overCbet?'3BET側でも自動CBはしない':'3BET側の自然なCB';
      severity=overCbet?'border':'good';
      suggest=overCbet?'推奨: チェックも多く混ぜる。打つなら25-40%pot中心':'推奨: 25-40%potのCBが自然。強い手はターン以降の設計も見る';
    }else if(action==='check'){
      verdict='3BET側でもチェック可';
      severity=strongMade&&!dynamic&&!multiway?'border':'good';
      suggest=severity==='border'?'推奨: ドライで強い手は小さめCBも混ぜる':'推奨: OOP・動的ボード・中程度SDVはチェックでよい';
    }else{
      verdict='3BET側の対応';severity='border';
      suggest='推奨: 相手のレイズ/ベットサイズとSPRで継続範囲を決める';
    }
    policy='3BET側はレンジ主導権を持ちますが、すべてのボードで大きく打つわけではありません。人数、ボード、SPRでCB頻度とサイズを調整します。';
    risk='CBを義務化すると、動的ボードやマルチウェイで弱いレンジを膨らませすぎます。逆に強いドライボードで打たなさすぎるとバリューを逃します。';
  }
  if(!lane)return null;
  return{lane,label,axis:'3BET/4BETポット',verdict,severity,policy,risk,suggest,mix,street,position:d.position||'',is3BetContext,is4BetContext,humanWasLastPfr,isOOP,spr,sizePct,onePair,strongOnePair,strongMade,strongDraw,dynamic,multiway,handType:ht,handRank:hRank};
}
function liveCashReraisedPotProfileText(profile){
  if(!profile)return'';
  return profile.label+' / '+profile.verdict+'：'+profile.policy+' '+profile.risk;
}
// [Codex fix 2026-06-06] Multiway live cash pots are a separate skill: bluff success drops and thin one-pair value changes.
function liveCashMultiwayProfile(hr,d,role,tex,nOpponents){
  if(!hr||!d||hr.tournamentContext&&hr.tournamentContext.enabled)return null;
  if(d.street==='preflop')return null;
  const opps=nOpponents||1;
  if(opps<2)return null;
  const action=d.action||'';
  const betLike=action==='raise'||action==='bet'||action==='allin';
  const facing=(d.toCall||0)>0;
  const betBase=d.toCall>0?Math.max(1,(d.pot||0)-d.toCall):(d.pot||0);
  const sizePct=betLike&&d.pot?Math.round((d.amount||0)/(d.pot||1)*100):(d.toCall&&betBase?Math.round(d.toCall/betBase*100):0);
  const players=opps+1;
  const onePair=!!(role&&(role.pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(role.note||'')));
  const weakPair=!!(onePair&&!['top_pair','overpair'].includes(role.pairTier||''));
  const strongOnePair=!!(onePair&&['top_pair','overpair'].includes(role.pairTier||'')&&(role.role==='strong'||role.role==='value'));
  const strongMade=!!(role&&(role.isNut||role.role==='nutted'||(!onePair&&(role.role==='strong'||role.role==='value'))));
  const draw=role&&role.draw?role.draw:null;
  const strongDraw=!!(draw&&((draw.outs||0)>=8||role.dynamic));
  const air=!!(role&&(role.role==='air'||/ハイカード|ドロー失敗/.test(role.note||'')));
  const dynamic=!!(tex&&(tex.dynamic||tex.flushy>=3||tex.connected>=3||tex.paired));
  let lane='',verdict='',severity='border',policy='',risk='',suggest='';
  if(action==='check'&&(air||onePair&&!strongMade||draw&&!strongDraw||role&&role.role==='medium')){
    lane='multiwayCheckControl';
    verdict='マルチウェイの自然なチェック';
    severity='good';
    suggest='推奨: チェックでレンジを守る。相手のサイズと人数を見て、次の判断を分ける';
  }else if(betLike&&!strongMade&&!strongDraw){
    if(onePair){
      lane='multiwayThinValue';
      verdict='マルチウェイの薄いベット注意';
      severity=sizePct>=50||dynamic||weakPair?'bad':'border';
      suggest=severity==='bad'?'推奨: チェック寄り。打つなら25-35%potで薄く、レイズにはかなり慎重':'推奨: 小さく薄いバリュー/プロテクトまで。大きく打たない';
    }else if(draw){
      lane='multiwayWeakDrawPressure';
      verdict='マルチウェイの弱いセミブラフ注意';
      severity=sizePct>=45?'bad':'border';
      suggest=severity==='bad'?'推奨: チェック寄り。強いドロー以外で大きく膨らませない':'推奨: 小さく打つかチェック。人数が多いほどブラフ頻度を下げる';
    }else{
      lane='multiwayBluffOverfreq';
      verdict='マルチウェイのブラフ過多';
      severity='bad';
      suggest='推奨: チェック。エアーの大きいブラフはほぼ不要';
    }
  }else if(betLike&&(strongMade||strongOnePair||strongDraw)){
    lane='multiwayValueProtection';
    const tooLarge=strongOnePair&&!strongMade&&(sizePct>=70||dynamic&&sizePct>=55);
    verdict=tooLarge?'強いワンペアでもサイズ注意':'マルチウェイのバリュー/プロテクト';
    severity=tooLarge?'border':'good';
    suggest=tooLarge?'推奨: 35-55%pot中心。強い完成役でなければ大きく膨らませすぎない':'推奨: 強い手と強いドローはベット可。相手が複数いるのでサイズは明確に';
  }else if(action==='call'&&facing&&(onePair&&!strongMade||draw&&!strongDraw||air)){
    lane=onePair?'multiwayOnePairCall':draw?'multiwayWeakDrawCall':'multiwayAirCall';
    verdict=onePair?'マルチウェイのワンペア受けすぎ注意':draw?'マルチウェイの弱ドロー受けすぎ注意':'マルチウェイのエアー受けすぎ';
    severity=(sizePct>=40||dynamic||players>=4)?'bad':'border';
    suggest=severity==='bad'?'推奨: フォールド寄り。コールするなら小サイズか明確なブロッカー/改善余地が必要':'推奨: 小サイズだけ一部コール。後ろに人が残る時はさらに締める';
  }else if(action==='fold'&&(air||weakPair||draw&&!strongDraw)){
    lane='multiwayDisciplineFold';
    verdict='マルチウェイの自然なフォールド';
    severity='good';
    suggest='推奨: 弱いSDVや弱いドローは無理に守らない';
  }
  if(!lane)return null;
  policy='マルチウェイでは、相手全員を降ろす必要があるためブラフ成功率が下がります。薄いワンペアのバリューも、コールされた後のレンジが強くなりやすいです。';
  risk=players+'wayでは誰かが強い手や強いドローを持っている頻度が上がります。$2/$5ライブではコールも多いので、弱い手でポットを大きくしすぎないことが大事です。';
  return{lane,label:'マルチウェイ',axis:'マルチウェイ',players,opponents:opps,sizePct,onePair,weakPair,strongOnePair,strongMade,draw:!!draw,strongDraw,air,dynamic,severity,verdict,policy,risk,suggest};
}
function liveCashMultiwayProfileText(profile){
  if(!profile)return'';
  return profile.players+'way / '+profile.verdict+'：'+profile.policy+' '+profile.risk;
}
// [Codex fix 2026-06-19] リバーは完成ボード上のブロッカー有無と、薄バリューで払わせたい相手レンジを分けて見る。
function liveCashRiverBlockerProfile(hr,role,tex){
  const human=hr&&hr.players?hr.players.find(function(p){return p.isHuman;}):null;
  const hole=human&&human.holeCards?human.holeCards:[];
  const board=hr&&hr.community?hr.community.slice(0,5):[];
  const suitCnt={};
  board.forEach(function(c){suitCnt[c.suit]=(suitCnt[c.suit]||0)+1;});
  const flushSuit=Object.keys(suitCnt).find(function(s){return suitCnt[s]>=3;})||'';
  const fourFlush=!!(flushSuit&&suitCnt[flushSuit]>=4);
  const heroFlushCards=flushSuit?hole.filter(function(c){return c.suit===flushSuit;}):[];
  const hasFlushBlocker=heroFlushCards.length>0;
  const hasNutFlushBlocker=heroFlushCards.some(function(c){return c.rank==='A';});
  const bestFlushBlocker=heroFlushCards.slice().sort(function(a,b){return (RANK_VAL[b.rank]||0)-(RANK_VAL[a.rank]||0);})[0]||null;
  const blockerRank=bestFlushBlocker?RANK_VAL[bestFlushBlocker.rank]||0:0;
  const suitText=flushSuit?(SUIT_SYM&&SUIT_SYM[flushSuit]?SUIT_SYM[flushSuit]:flushSuit):'';
  const ranks=[...new Set(board.map(function(c){return RANK_VAL[c.rank]||0;}))].sort(function(a,b){return a-b;});
  let straightComplete=false;
  for(let i=0;i<=ranks.length-5;i++){if(ranks[i+4]-ranks[i]===4)straightComplete=true;}
  if(ranks.includes(14)&&ranks.includes(5)&&ranks.includes(4)&&ranks.includes(3)&&ranks.includes(2))straightComplete=true;
  const boardRankSet=new Set(ranks);
  const heroRankSet=new Set(hole.map(function(c){return RANK_VAL[c.rank]||0;}));
  const straightWindows=[[14,5,4,3,2]];
  for(let low=2;low<=10;low++)straightWindows.push([low,low+1,low+2,low+3,low+4]);
  let hasStraightBlocker=false,straightBlockerHigh=0;
  straightWindows.forEach(function(w){
    if(!w.every(function(v){return boardRankSet.has(v);}))return;
    w.forEach(function(v){
      if(heroRankSet.has(v)){hasStraightBlocker=true;straightBlockerHigh=Math.max(straightBlockerHigh,v);}
    });
  });
  const boardPaired=!!(tex&&tex.paired);
  let label='ブロッカー影響小',severity='neutral',note='',coach='',blockerStrength='none',callModifier='neutral',bluffModifier='neutral',valueModifier='neutral';
  if(flushSuit){
    if(hasNutFlushBlocker){
      label=fourFlush?'4枚フラッシュのAブロッカー':'ナッツフラッシュブロッカーあり';
      severity='good';
      blockerStrength='nut';
      callModifier=fourFlush?'soften':'neutral';
      bluffModifier='good';
      note='こちらがA'+suitText+'を持つため、相手のナッツフラッシュは少し減ります。ただし完成役そのものを消せるわけではありません。';
      coach='こちらはA'+suitText+'を持っているので、相手の一番強いフラッシュは少し減ります。'+(boardPaired?'ただしペアボードなので、フルハウスまでは消せません。':'それでも下のフラッシュやセットは残ります。');
    }else if(blockerRank>=12){
      label='高いフラッシュブロッカーあり';
      severity='medium';
      blockerStrength='high';
      callModifier=fourFlush?'neutral':'softenSmall';
      bluffModifier='medium';
      note='こちらが高い同スートを持つため、相手の強いフラッシュ候補は少し減ります。';
      coach='こちらは高い'+suitText+'を持っています。Aブロッカーほど強くはありませんが、相手の強いフラッシュ候補を少し減らします。';
    }else if(hasFlushBlocker){
      label='低いフラッシュブロッカーあり';
      severity='medium';
      blockerStrength='low';
      callModifier=fourFlush?'tightenLight':'neutral';
      bluffModifier='weak';
      note='こちらも同じスートを1枚持つため、相手のフラッシュ候補は少し減ります。';
      coach='同じ'+suitText+'は持っていますが、低いカードなので安心材料としては弱めです。大きなコールを正当化するほどのブロッカーではありません。';
    }else{
      label=fourFlush?'4枚フラッシュでブロッカーなし':'フラッシュブロッカーなし';
      severity='bad';
      callModifier=fourFlush?'tightenStrong':'tighten';
      bluffModifier='bad';
      valueModifier='tighten';
      note='こちらは完成フラッシュをブロックしていません。相手のバリュー寄りリバーベットには厳しめに見ます。';
      coach='こちらは'+suitText+'を持っていないので、相手のフラッシュ候補を減らしていません。完成ボードで大きく受ける時はかなり慎重に見ます。';
    }
  }else if(straightComplete){
    label=hasStraightBlocker?'ストレートブロッカーあり':'ストレート完成ボード';
    severity=hasStraightBlocker?'medium':'medium';
    blockerStrength=hasStraightBlocker&&straightBlockerHigh>=10?'high':hasStraightBlocker?'low':'none';
    callModifier=hasStraightBlocker?'neutral':'tightenLight';
    bluffModifier=hasStraightBlocker?'medium':'neutral';
    note='ストレートが完成し得るボードです。こちらのワンペアはブラフキャッチ寄りに下げて見ます。';
    coach=hasStraightBlocker?'こちらはストレートに絡むカードを持っています。少しだけ相手のストレート候補を減らしますが、強い根拠としてはサイズとラインも必要です。':'ストレートが完成し得るボードです。こちらのワンペアは、相手のサイズが大きいほど守りすぎないようにします。';
  }else if(boardPaired){
    label='ペアボード';
    severity='medium';
    callModifier='tightenLight';
    note='フルハウスやトリップスが一部残るため、非ナッツの大きな受けや大きな薄バリューは慎重に見ます。';
    coach='ペアボードなので、フルハウスやトリップスが一部残ります。フラッシュやストレートを持っていても、全体ナッツかは別に確認します。';
  }
  return{flushSuit,fourFlush,hasFlushBlocker,hasNutFlushBlocker,bestFlushBlocker,blockerRank,blockerStrength,hasStraightBlocker,straightBlockerHigh,straightComplete,boardPaired,label,severity,note,coach,callModifier,bluffModifier,valueModifier};
}
function liveCashRiverThinValueTarget(role,completed,pressure,multiway){
  if(!role)return{label:'下のペア',note:'下のペアや弱いトップペアに小さく払ってもらう狙いです。'};
  if(completed||pressure>=2||multiway)return{label:'かなり限られた下のワンペア',note:'完成役や強いレンジが増えるので、払ってくれる下のハンドはかなり限られます。小さめかチェック寄りです。'};
  if(role.pairTier==='overpair')return{label:'トップペア/セカンドペア',note:'オーバーペアなら、トップペアやセカンドペアから小〜中サイズで取る狙いです。'};
  if(role.pairTier==='top_pair')return{label:'弱いトップペア/セカンドペア',note:'トップペアなら、弱いトップペアやセカンドペアに残ってもらうサイズを選びます。'};
  return{label:'下のペア',note:'中程度のワンペアは、下のペアがコールできる小さめサイズに寄せます。'};
}
// [Codex fix 2026-06-21] リバーベット/レイズを、対象レンジ・降ろすレンジ・サイズ目的で設計する。
function liveCashRiverBetDesignProfile(role,lane,sizePct,completed,pressure,multiway,blocker,thinTarget,line,opponentTendency){
  role=role||{}; blocker=blocker||{}; thinTarget=thinTarget||{}; line=line||{}; opponentTendency=opponentTendency||null;
  const onePair=!!(role.pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(role.note||''));
  const isNut=!!(role.isNut||role.role==='nutted'||role.nutFlush&&!role.isVuln);
  const strongMade=!!(isNut||role.role==='strong'||(!onePair&&role.role==='value'));
  const air=!!(role.role==='air'||/ハイカード|ドロー失敗/.test(role.note||''));
  const nonNutStrong=!!(strongMade&&!isNut&&(role.isVuln||completed));
  let plan='mixed',target='相手の継続レンジ',foldOut='弱いショーダウンバリュー',sizeBand='40〜60%pot',warning='',severity='border';
  if(lane==='riverHeroRaise'){
    if(isNut){
      plan='raiseForStacks';
      target='下の強い完成役、降りきれない強いワンペア';
      foldOut='ほぼなし。降ろすより取り切りが目的';
      sizeBand=opponentTendency&&opponentTendency.valueLoosen?'大きめレイズ〜オールイン候補':'2.5〜4倍前後';
      severity='good';
      warning='相手レンジは強くなりますが、全体ナッツ級なら取り切りを優先します。';
    }else{
      plan='raiseCaution';
      target='かなり限られた下の完成役';
      foldOut='薄いワンペアや空振り。ただし多くはレイズ前に降りる層';
      sizeBand='コール止め、または小さめレイズだけ';
      severity='bad';
      warning='非ナッツのリバーレイズは、コールされる相手が上位完成役に寄りやすいです。';
    }
  }else if(lane==='riverThinValueSize'){
    plan='thinValue';
    target=thinTarget.label||'下のワンペア';
    foldOut='空振りや弱すぎるショーダウン価値';
    sizeBand=(completed||pressure>=2||multiway)?'25〜40%pot':'25〜50%pot';
    if(opponentTendency&&opponentTendency.valueLoosen&&!multiway&&!completed)sizeBand='40〜65%pot';
    severity=sizePct>=(completed?50:65)||multiway&&sizePct>=45?'bad':'good';
    warning='薄いバリューは、弱い手に残ってもらうサイズ選びが中心です。大きすぎると強い手だけが残ります。';
  }else if(lane==='riverBluffCandidate'){
    plan='bluff';
    target='基本はなし。コールされたらほぼ負ける想定';
    foldOut='弱いワンペア、Aハイ、空振りドローの一部';
    sizeBand=blocker&&blocker.hasNutFlushBlocker?'45〜65%pot':'チェック寄り。打つなら40〜60%pot';
    severity=(completed&&!blocker.hasNutFlushBlocker)||multiway||opponentTendency&&opponentTendency.bluffTighten?'bad':'border';
    warning='リバーブラフはドロー警戒ではなく、相手に降りる手が残っているかとブロッカーで作ります。';
  }else if(lane==='riverValueTarget'){
    plan=isNut?'bigValue':'value';
    target=isNut?'下の完成役、強いワンペア、降りきれないブラフキャッチ':'下の完成役、トップペア、降りきれないワンペア';
    foldOut='空振りや弱すぎるペア';
    sizeBand=isNut?'60〜100%pot':'50〜80%pot';
    if(nonNutStrong&&completed)sizeBand='50〜75%pot';
    if(opponentTendency&&opponentTendency.valueLoosen)sizeBand=isNut?'75〜125%pot':'60〜90%pot';
    severity='good';
    warning=nonNutStrong?'強い完成役でも全体ナッツでない時は、レイズ返しに慎重に対応します。':'強い手は、相手が払う下の手を想定して取り切ります。';
  }else if(lane==='riverPotControlCheck'){
    plan='showdown';
    target='なし。ショーダウン価値を守る';
    foldOut='なし';
    sizeBand='チェック';
    severity='good';
    warning='ワンペアは薄く取りに行くより、チェックで実現する価値が高い場面があります。';
  }else if(lane==='riverGiveUp'){
    plan='giveUp';
    target='なし';
    foldOut='なし';
    sizeBand='チェック';
    severity='good';
    warning='ブラフ条件が薄い時は、打たないことが利益を守る判断です。';
  }else if(lane==='riverMissedValue'){
    plan=isNut?'missedValue':'trapOrShowdown';
    target=isNut?'下の完成役や強いワンペア':'相手が打つブラフ/薄いバリュー';
    foldOut='なし';
    sizeBand=isNut?'60〜80%potも候補':'チェック許容';
    severity=isNut?'border':'good';
    warning=isNut?'ナッツ級は取り逃しに注意します。':'非ナッツ強手はチェックで誘う形も混ざります。';
  }
  return{plan,target,foldOut,sizeBand,warning,severity};
}
function liveCashRiverLineProfile(before,d){
  before=before||[];
  d=d||{};
  const villainBetFlop=before.some(function(x){return !x.isHuman&&x.street==='flop'&&(x.action==='raise'||x.action==='bet'||x.action==='allin');});
  const villainBetTurn=before.some(function(x){return !x.isHuman&&x.street==='turn'&&(x.action==='raise'||x.action==='bet'||x.action==='allin');});
  const villainBetRiver=before.some(function(x){return !x.isHuman&&x.street==='river'&&(x.action==='raise'||x.action==='bet'||x.action==='allin');});
  const villainCalledTurn=before.some(function(x){return !x.isHuman&&x.street==='turn'&&x.action==='call';});
  const villainCalledFlop=before.some(function(x){return !x.isHuman&&x.street==='flop'&&x.action==='call';});
  const humanBetTurn=before.some(function(x){return x.isHuman&&x.street==='turn'&&(x.action==='raise'||x.action==='bet'||x.action==='allin');});
  const villainCheckedRiver=before.some(function(x){return !x.isHuman&&x.street==='river'&&x.action==='check';});
  const facing=!!((d.toCall||0)>0||d.facingRaise);
  const betLike=d.action==='raise'||d.action==='bet'||d.action==='allin';
  let label='リバー単発判断',density='medium',callTighten=false,valueTighten=false,bluffTighten=false,note='このリバーだけで判断しすぎず、サイズと相手傾向を合わせて見ます。';
  if(facing&&villainBetRiver&&villainBetFlop&&villainBetTurn){
    label='3バレル';
    density='very_high';
    callTighten=true;
    note='相手がフロップからリバーまで打ち続けたラインです。ライブ$2/$5では大きいサイズほどバリュー寄りに見ます。';
  }else if(facing&&villainBetRiver&&villainBetTurn){
    label='ターン・リバー連続ベット';
    density='high';
    callTighten=true;
    note='相手が後半2ストリートで続けて打ったラインです。ワンペアはブラフキャッチ寄りに下げて見ます。';
  }else if(facing&&villainBetRiver&&humanBetTurn&&villainCalledTurn){
    label='ターンコール後のリバーベット';
    density='high';
    callTighten=true;
    note='ターンでこちらのベットにコールした相手が、リバーで打ち返しているラインです。完成役や強いワンペア以上を濃く見ます。';
  }else if(facing&&villainBetRiver&&!villainBetFlop&&!villainBetTurn){
    label='単発リバーベット';
    density='medium';
    note='相手の圧力はリバーの一度だけです。小さめならブラフも残りますが、大きいサイズはバリュー寄りに寄せます。';
  }else if(betLike&&humanBetTurn&&villainCalledTurn){
    label='ターンコール後のリバー継続';
    density='high';
    valueTighten=true;
    bluffTighten=true;
    note='ターンで相手がコールしてリバーまで残ったラインです。こちらが打つなら、払ってくれる下の手か降ろせる手をかなり具体的に見ます。';
  }else if(betLike&&villainCheckedRiver){
    label='相手チェック後のリバーベット';
    density='medium_low';
    note='相手がリバーでチェックした後のベットです。取り切りや薄バリューを作れますが、完成ボードではサイズを絞ります。';
  }else if(betLike&&villainCalledFlop){
    label='コールレンジ相手のリバーベット';
    density='medium';
    valueTighten=true;
    note='相手はフロップ以降に一度は続行しています。薄いバリューは相手のコールできる下の手を先に決めます。';
  }
  return{label,density,callTighten,valueTighten,bluffTighten,note};
}
function liveCashRiverRaiseResponseProfile(role,action,sizePct,completed,line,blocker,multiway){
  role=role||{};
  line=line||{};
  blocker=blocker||{};
  const onePair=!!(role.pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(role.note||''));
  const weakPair=!!(onePair&&(['board_pair','under_pair','bottom_pair','low_pair','second_pair'].includes(role.pairTier)||role.role==='medium'));
  const strongOnePair=!!(onePair&&['top_pair','overpair'].includes(role.pairTier||'')&&(role.role==='strong'||role.role==='value'));
  const lowerTwoPair=role.madeClass==='two_pair'&&role.valueTier!=='top_two_pair';
  const topTwo=role.madeClass==='two_pair'&&role.valueTier==='top_two_pair';
  const straight=!!(/ストレート/.test(role.note||''));
  const flush=role.madeClass==='flush';
  const weakFlush=!!(flush&&(role.weakFlush||role.flushHighRank<=9));
  const pairedNutFlush=!!(flush&&role.nutFlush&&role.isVuln&&!role.isNut);
  const trips=role.madeClass==='trips'||role.madeClass==='board_trips';
  const nutOrBoat=!!(role.isNut||role.role==='nutted'||role.madeClass==='quads'||role.madeClass==='straight_flush'||/フルハウス|フォーカード|ロイヤル/.test(role.note||''));
  const nonNutStrong=!!(!nutOrBoat&&(topTwo||lowerTwoPair||straight||flush||trips||role.isVuln||onePair));
  const vulnerable=!!(weakPair||onePair||lowerTwoPair||weakFlush||pairedNutFlush||straight&&completed||trips||role.isVuln||multiway);
  const raiseLarge=sizePct>=45||line.density==='high'||line.density==='very_high'||completed;
  let classLabel='非ナッツの完成役';
  if(onePair)classLabel=strongOnePair?'強いワンペア':'弱いワンペア';
  else if(lowerTwoPair)classLabel='下のツーペア';
  else if(topTwo)classLabel='トップツーペア';
  else if(weakFlush)classLabel='弱いフラッシュ';
  else if(pairedNutFlush)classLabel='ペアボード上のAハイフラッシュ';
  else if(flush)classLabel=role.isNut?'強いフラッシュ':'非ナッツフラッシュ';
  else if(straight)classLabel=role.isNut?'強いストレート':'非ナッツストレート';
  else if(trips)classLabel='トリップス';
  if(nutOrBoat){
    return{classLabel,severity:action==='fold'?'bad':'good',verdict:action==='fold'?'ナッツ級の降りすぎ':'レイズ対応できる強手',policy:'全体ナッツ級なら、リバーのレイズにも基本的には続行できます。相手がさらに上を持つ組み合わせだけ確認します。',suggest:action==='fold'?'推奨: コールまたはリレイズを検討':'推奨: コール以上で続行。相手タイプでリレイズ量を選ぶ'};
  }
  if(!nonNutStrong)return null;
  if(action==='fold'){
    const good=vulnerable||raiseLarge;
    return{classLabel,severity:good?'good':'border',verdict:good?'リバーレイズへの良いフォールド':'リバーレイズへの慎重フォールド',policy:'リバーでこちらのベットにレイズが返ると、相手レンジはかなり強くなります。非ナッツは「強いから払う」ではなく、下のバリューやブラフが十分あるかで決めます。',suggest:good?'推奨: このフォールドを維持。相手がレイズブラフ過多の時だけコールを戻す':'相手依存: 小さいレイズなら一部コールも残す'};
  }
  if(action==='call'){
    const bad=vulnerable&&raiseLarge||weakPair||weakFlush||pairedNutFlush||lowerTwoPair&&completed||onePair&&sizePct>=35;
    return{classLabel,severity:bad?'bad':'border',verdict:bad?'リバーレイズへのコールしすぎ':'リバーレイズへの境界コール',policy:'リバーでレイズされた時は、相手のブラフ頻度が一気に減ります。特に$2/$5では、非ナッツのコールは大きな損失になりやすいです。',suggest:bad?'推奨: フォールド寄り。コールするなら相手がレイズブラフを見せている時だけ':'相手依存: 小さいレイズだけ一部コール。大きいレイズはフォールド寄り'};
  }
  return null;
}
function liveCashRiverHeroRaiseProfile(role,sizePct,completed,blocker,multiway){
  role=role||{};
  blocker=blocker||{};
  const onePair=!!(role.pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(role.note||''));
  const lowerTwoPair=role.madeClass==='two_pair'&&role.valueTier!=='top_two_pair';
  const topTwo=role.madeClass==='two_pair'&&role.valueTier==='top_two_pair';
  const straight=!!(/ストレート/.test(role.note||''));
  const flush=role.madeClass==='flush';
  const weakFlush=!!(flush&&(role.weakFlush||role.flushHighRank<=9));
  const pairedNutFlush=!!(flush&&role.nutFlush&&role.isVuln&&!role.isNut);
  const trips=role.madeClass==='trips'||role.madeClass==='board_trips';
  const nutOrBoat=!!(role.isNut||role.role==='nutted'||role.madeClass==='quads'||role.madeClass==='straight_flush'||/フルハウス|フォーカード|ロイヤル/.test(role.note||''));
  const nonNutRaise=!!(onePair||lowerTwoPair||weakFlush||pairedNutFlush||straight&&completed||trips||role.isVuln||multiway);
  let classLabel='非ナッツの完成役';
  if(onePair)classLabel='ワンペア';
  else if(lowerTwoPair)classLabel='下のツーペア';
  else if(topTwo)classLabel='トップツーペア';
  else if(weakFlush)classLabel='弱いフラッシュ';
  else if(pairedNutFlush)classLabel='ペアボード上のAハイフラッシュ';
  else if(flush)classLabel=role.isNut?'強いフラッシュ':'非ナッツフラッシュ';
  else if(straight)classLabel=role.isNut?'強いストレート':'非ナッツストレート';
  else if(trips)classLabel='トリップス';
  if(nutOrBoat){
    return{classLabel,severity:'good',verdict:'ナッツ級のリバーレイズ',policy:'相手がベットしてきたリバーで全体ナッツ級を持つ時は、レイズで取り切る候補が自然です。相手がコールできる強い下の役を想定してサイズを選びます。',suggest:'推奨: 2.5〜4倍前後。相手がコールしすぎるなら大きめも可'};
  }
  if(!nonNutRaise)return null;
  const tooBig=sizePct>=75||completed||multiway||blocker.severity==='bad';
  return{classLabel,severity:tooBig?'bad':'border',verdict:tooBig?'非ナッツのリバーレイズしすぎ':'非ナッツのリバーレイズ境界',policy:'リバーで相手のベットにレイズすると、相手の続行レンジはかなり強くなります。非ナッツはコール止めや小さめレイズを優先します。',suggest:tooBig?'推奨: コール止め、またはかなり小さいレイズだけ。大きいレイズやオールインは避ける':'相手依存: 小さめレイズだけ低頻度。強い反撃には素直に降りる'};
}
// [Codex fix 2026-06-21] 相手タイプをリバー専用ではなく、ポストフロップ全体の判断軸として使える形にする。
function liveCashOpponentTypeProfile(player){
  if(!player||!player.profile)return null;
  const prof=player.profile||{};
  const bluff=prof.bluffFreq==null?0.2:prof.bluffFreq;
  const fold=prof.foldToBetBase==null?0.55:prof.foldToBetBase;
  const station=!!(prof.cantFoldMadeHand||prof.callBias||fold<=0.45);
  const valueHeavy=!!(bluff<=0.08||fold>=0.75);
  const bluffHeavy=!!(bluff>=0.38);
  let label='標準的';
  let note='標準寄りの相手なので、サイズとラインを優先して判断します。';
  let postflopNote='';
  let callTighten=false,callLoosen=false,valueLoosen=false,bluffTighten=false,raiseRespect=false,bluffLoosen=false;
  if(station){
    label='コール多め';
    note='降りにくい相手です。薄いバリューは増やし、空振りブラフは減らします。';
    postflopNote='相手はコール多めです。ブラフで降ろすより、下のワンペアやドローに払ってもらうベットを優先します。';
    valueLoosen=true; bluffTighten=true;
  }else if(valueHeavy){
    label='ブラフ不足';
    note='強く打つ時はバリュー寄りに見ます。こちらの受けは少し締めます。';
    postflopNote='相手はブラフ不足寄りです。こちらから小さく降ろすベットは通りやすい一方、強く返された時は重く見ます。';
    callTighten=true; raiseRespect=true; bluffLoosen=true;
  }else if(bluffHeavy){
    label='ブラフ多め';
    note='ブラフが残りやすい相手です。中サイズ以下には一部コールを残します。';
    postflopNote='相手はブラフ多めです。こちらの受けは少し広げますが、こちらからの薄いブラフは反撃に注意します。';
    callLoosen=true;
  }
  return{player,name:player.name,style:prof.style||'',label,note,postflopNote,bluffFreq:bluff,foldToBetBase:fold,callTighten,callLoosen,valueLoosen,bluffTighten,raiseRespect,bluffLoosen};
}
function liveCashDecisionOpponentTypeProfile(hr,d,before){
  if(!hr||!hr.players||!d)return null;
  before=before||[];
  let idx=null;
  for(let i=before.length-1;i>=0;i--){
    const x=before[i];
    if(x&&!x.isHuman&&x.playerIdx!=null&&(x.street===d.street||x.action==='bet'||x.action==='raise'||x.action==='allin'||x.action==='call')){
      idx=x.playerIdx;break;
    }
  }
  if(idx==null&&d.playerIdx!=null){
    const opp=hr.players.find(function(p,i){return i!==d.playerIdx&&!p.isHuman;});
    if(opp)idx=hr.players.indexOf(opp);
  }
  if(idx==null)idx=hr.players.findIndex(function(p){return p&&!p.isHuman;});
  return idx>=0?liveCashOpponentTypeProfile(hr.players[idx]):null;
}
function liveCashRiverOpponentTendencyProfile(hr,d,before){
  if(!hr||!hr.players||!d)return null;
  before=before||[];
  let idx=null;
  for(let i=before.length-1;i>=0;i--){
    const x=before[i];
    if(x&&!x.isHuman&&x.playerIdx!=null&&(x.street==='river'||x.street==='turn'||x.street==='flop')){
      if(x.street==='river'&&(x.action==='bet'||x.action==='raise'||x.action==='allin'||x.action==='call'||x.action==='check')){idx=x.playerIdx;break;}
      if(idx==null&&(x.action==='bet'||x.action==='raise'||x.action==='allin'||x.action==='call'))idx=x.playerIdx;
    }
  }
  if(idx==null&&d.playerIdx!=null){
    const opp=hr.players.find(function(p,i){return i!==d.playerIdx&&!p.isHuman;});
    if(opp)idx=hr.players.indexOf(opp);
  }
  if(idx==null)idx=hr.players.findIndex(function(p){return p&&!p.isHuman;});
  const p=idx>=0?hr.players[idx]:null;
  const prof=p&&p.profile;
  if(!prof)return null;
  const style=(prof.style||'')+' '+(prof.desc||'');
  const bluff=prof.bluffFreq==null?0.2:prof.bluffFreq;
  const fold=prof.foldToBetBase==null?0.55:prof.foldToBetBase;
  const station=!!(prof.cantFoldMadeHand||prof.callBias||fold<=0.45||/フォールドできない|コール多め/.test(style));
  const valueHeavy=!!(bluff<=0.08||/タイトパッシブ|ニット|ブラフなし|ベットしたら強い|ナッツ級/.test(style));
  const bluffHeavy=!!(bluff>=0.38||/ブラフ過多|ルーズアグレッシブ/.test(style));
  let label='標準的';
  let note='標準寄りの相手なので、サイズとラインを優先します。';
  let callTighten=false,callLoosen=false,valueLoosen=false,bluffTighten=false,raiseRespect=false;
  if(valueHeavy){
    label='ブラフ不足';
    note='この相手のリバーベット/レイズはバリュー寄りに見ます。ワンペアの受けは少し締めます。';
    callTighten=true;raiseRespect=true;
  }else if(bluffHeavy){
    label='ブラフ多め';
    note='この相手はブラフが残りやすいので、小〜中サイズには一部コールを戻せます。';
    callLoosen=true;
  }else if(station){
    label='コール多め';
    note='この相手は降りにくいので、薄いバリューは増やし、ブラフは減らします。';
    valueLoosen=true;bluffTighten=true;
  }
  return{player:p,name:p.name,style:prof.style||'',label,note,bluffFreq:bluff,foldToBetBase:fold,callTighten,callLoosen,valueLoosen,bluffTighten,raiseRespect};
}
// [Codex fix 2026-06-06] リングのリバーは、ワンペア受け・薄バリュー・ブラフ断念を金額とラインで最終判定する。
function liveCashRiverDecisionProfile(hr,d,role,tex,nOpponents){
  if(!hr||!d||hr.tournamentContext&&hr.tournamentContext.enabled)return null;
  if(d.street!=='river'||!role)return null;
  const action=d.action||'';
  const betLike=action==='raise'||action==='bet'||action==='allin';
  const facing=!!((d.toCall||0)>0||d.facingRaise);
  const basePot=facing?Math.max(1,(d.pot||0)-(d.toCall||0)):Math.max(1,d.pot||1);
  const sizePct=facing?Math.round((d.toCall||d.amount||0)/basePot*100):(betLike?Math.round((d.amount||0)/Math.max(1,d.pot||1)*100):0);
  const raiseSizePct=facing&&betLike?Math.round((d.amount||0)/basePot*100):sizePct;
  const idx=streetDecisionIndex(hr,d);
  const before=idx>=0?hr.decisions.slice(0,idx):hr.decisions;
  const villainBetFlop=before.some(function(x){return !x.isHuman&&x.street==='flop'&&(x.action==='raise'||x.action==='bet'||x.action==='allin');});
  const villainBetTurn=before.some(function(x){return !x.isHuman&&x.street==='turn'&&(x.action==='raise'||x.action==='bet'||x.action==='allin');});
  const villainBetRiver=before.some(function(x){return !x.isHuman&&x.street==='river'&&(x.action==='raise'||x.action==='bet'||x.action==='allin');});
  const villainCallRiver=before.some(function(x){return !x.isHuman&&x.street==='river'&&x.action==='call';});
  const villainCalledTurn=before.some(function(x){return !x.isHuman&&x.street==='turn'&&x.action==='call';});
  const humanBetTurn=before.some(function(x){return x.isHuman&&x.street==='turn'&&(x.action==='raise'||x.action==='bet'||x.action==='allin');});
  const humanRiverAggIndex=before.findIndex(function(x){return x.isHuman&&x.street==='river'&&(x.action==='raise'||x.action==='bet'||x.action==='allin');});
  const facingRiverRaise=!!(facing&&humanRiverAggIndex>=0&&before.some(function(x,i){return i>humanRiverAggIndex&&!x.isHuman&&x.street==='river'&&(x.action==='raise'||x.action==='allin');}));
  const villainRiverBetBefore=before.some(function(x){return !x.isHuman&&x.street==='river'&&(x.action==='raise'||x.action==='bet'||x.action==='allin');});
  const heroRaisesRiverBet=!!(facing&&betLike&&(villainRiverBetBefore||d.facingRaise));
  const pressure=(villainBetFlop?1:0)+(villainBetTurn?1:0)+(villainBetRiver?1:0)+(villainCalledTurn&&humanBetTurn?1:0);
  const multiway=(nOpponents||1)>=2;
  const onePair=!!(role&&(role.pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(role.note||'')));
  const weakPair=!!(onePair&&(['board_pair','under_pair','bottom_pair','low_pair','second_pair'].includes(role.pairTier)||role.role==='medium'));
  const strongOnePair=!!(onePair&&['top_pair','overpair'].includes(role.pairTier||'')&&(role.role==='strong'||role.role==='value'));
  const strongMade=!!(role&&(role.isNut||role.role==='nutted'||(!onePair&&(role.role==='strong'||role.role==='value'))));
  const air=!!(role&&(role.role==='air'||/ハイカード|ドロー失敗/.test(role.note||'')));
  const drawMiss=!!(air||role&&role.draw&&role.draw.outs);
  const completed=!!(tex&&(tex.flushy>=3||tex.straightDraw||tex.connected>=3||tex.paired||tex.dynamic));
  const nonNutValue=!!(strongMade&&!role.isNut&&(role.isVuln||completed));
  const blocker=liveCashRiverBlockerProfile(hr,role,tex);
  const blockerBad=!!(blocker&&blocker.severity==='bad'&&completed);
  const blockerGood=!!(blocker&&blocker.hasNutFlushBlocker);
  const blockerTightenStrong=!!(blocker&&blocker.callModifier==='tightenStrong'&&completed);
  const blockerTighten=!!(blocker&&/^tighten/.test(blocker.callModifier||'')&&completed);
  const blockerSoften=!!(blocker&&(blocker.callModifier==='soften'||blocker.callModifier==='softenSmall')&&completed);
  const blockerBluffGood=!!(blocker&&(blocker.bluffModifier==='good'||blocker.bluffModifier==='medium'));
  const thinTarget=liveCashRiverThinValueTarget(role,completed,pressure,multiway);
  const line=liveCashRiverLineProfile(before,d);
  const opponentTendency=liveCashRiverOpponentTendencyProfile(hr,d,before);
  let lane='',verdict='',severity='border',policy='',risk='',suggest='';
  const raiseResponse=facingRiverRaise&&(action==='call'||action==='fold')?liveCashRiverRaiseResponseProfile(role,action,sizePct,completed,line,blocker,multiway):null;
  const heroRaise=heroRaisesRiverBet?liveCashRiverHeroRaiseProfile(role,raiseSizePct,completed,blocker,multiway):null;
  if(raiseResponse){
    lane='riverRaiseResponse';
    severity=raiseResponse.severity;
    verdict=raiseResponse.verdict;
    policy=raiseResponse.policy;
    risk=sizePct+'%pot / '+(completed?'完成寄りボード':'比較的静的なボード')+' / 相手圧力'+pressure+'回 / ハンド='+raiseResponse.classLabel+' / ライン=リバーレイズ対応';
    suggest=raiseResponse.suggest;
  }else if(heroRaise){
    lane='riverHeroRaise';
    severity=heroRaise.severity;
    verdict=heroRaise.verdict;
    policy=heroRaise.policy;
    risk=raiseSizePct+'%pot / '+(completed?'完成寄りボード':'比較的静的なボード')+' / 相手圧力'+pressure+'回 / ハンド='+heroRaise.classLabel+' / ライン=リバーでこちらがレイズ';
    suggest=heroRaise.suggest;
  }else if(action==='call'&&facing&&onePair&&!strongMade){
    lane='riverOnePairCatch';
    // [Claude fix 2026-06-10] strongOnePair(TPTK/トップペア等)はpressure>=2だけでheavy=trueにしない。
    // KK66型でvillainがターンレイズ+リバーベットしても、TPTKは43%pot程度なら明確コール。
    // heavyはsizePct>=65 OR 非strongOnePairのpressure>=2 OR weakPair等の時のみ。
    const heavy=sizePct>=65||(pressure>=2&&!strongOnePair)||pressure>=3||
                (completed&&!strongOnePair)||multiway&&(sizePct>=45||!strongOnePair)||
                weakPair||villainBetRiver&&villainCallRiver||
                blockerTightenStrong&&sizePct>=35||
                blockerBad&&sizePct>=45&&!blockerGood||
                blockerTighten&&sizePct>=55&&!blockerGood||
                completed&&pressure>=2&&sizePct>=50||
                line.callTighten&&sizePct>=55||
                line.density==='very_high'&&sizePct>=45;
    severity=heavy?'bad':'border';
    if(heavy&&blockerSoften&&sizePct<=55&&!multiway&&pressure<=1&&line.density==='medium')severity='border';
    verdict=heavy?'ワンペアのリバーコール過多':'ワンペアのブラフキャッチ境界';
    policy='リバーのワンペアは「勝っていそう」ではなく、相手のサイズとラインにブラフが残るかで判断します。';
    risk=sizePct+'%pot / '+(completed?'完成寄りボード':'比較的静的なボード')+' / 相手圧力'+pressure+'回'+(multiway?' / マルチウェイ':'')+(blocker&&blocker.label?' / '+blocker.label:'')+' / ライン='+line.label;
    suggest=heavy?'推奨: フォールド寄り。コールするなら相手が明確にブラフ過多、または強いブロッカーがある時だけ':'相手依存: 小〜中サイズなら一部コール、パッシブ相手はフォールド寄り';
  }else if(betLike&&onePair&&!strongMade){
    lane='riverThinValueSize';
    const tooBig=sizePct>=65||completed&&sizePct>=50||multiway&&sizePct>=45||blockerBad&&sizePct>=50||blockerTightenStrong&&sizePct>=40||line.valueTighten&&sizePct>=50;
    severity=tooBig?'bad':sizePct>=45?'border':'good';
    verdict=tooBig?'ワンペアの薄バリューが大きすぎる':'ワンペアの薄バリューサイズ';
    policy='リバーでワンペアから取る時は、どの下のハンドに払ってほしいかを先に決めます。'+thinTarget.note;
    risk=sizePct+'%pot / '+(completed?'完成寄りボード':'比較的静的なボード')+' / 相手圧力'+pressure+'回'+(multiway?' / マルチウェイ':'')+' / ターゲット='+thinTarget.label+(blocker&&blocker.label?' / '+blocker.label:'')+' / ライン='+line.label;
    suggest=tooBig?'推奨: チェックまたは25〜45%pot。完成寄りボードでは特に小さめ':'推奨: 25〜45%potの薄バリュー。レイズにはかなり慎重';
  }else if(betLike&&(air||drawMiss)&&!strongMade){
    lane='riverBluffCandidate';
    const bad=multiway||completed&&!blockerGood&&!blockerBluffGood||sizePct>=70||pressure>=2||line.bluffTighten&&sizePct>=50;
    severity=bad?'bad':'border';
    verdict=bad?'リバーブラフの成功条件不足':'リバーブラフ候補';
    policy='リバーのブラフは、相手のレンジに降りる手が多く、こちらにブロッカーや自然なストーリーがある時だけ作ります。完成ボードや$2/$5のコール多め相手には頻度を落とします。';
    risk=sizePct+'%pot / '+(completed?'完成寄りボード':'比較的静的なボード')+' / 相手圧力'+pressure+'回'+(multiway?' / マルチウェイ':'')+(blocker&&blocker.label?' / '+blocker.label:'')+' / ライン='+line.label;
    suggest=bad?'推奨: チェックで諦める。打つなら明確なブロッカーと相手傾向が必要':'候補: 40〜60%potを低頻度。相手が降りるレンジを持つ時だけ';
  }else if(betLike&&strongMade){
    lane='riverValueTarget';
    const lowerTwoPair=role.madeClass==='two_pair'&&role.valueTier==='lower_two_pair';
    const weakFlush=role.madeClass==='flush'&&(role.weakFlush||role.flushHighRank<=9);
    const pairedWeakFlush=weakFlush&&tex&&tex.paired;
    const over=nonNutValue&&sizePct>=100||lowerTwoPair&&sizePct>=75||pairedWeakFlush&&sizePct>=45;
    severity=over?'border':'good';
    if(pairedWeakFlush){
      verdict=over?'ペアボードの弱フラッシュは大きく取り切らない':'ペアボードの弱フラッシュは薄く扱う';
      policy='弱いフラッシュは完成役ですが、ペアボードではフルハウス・トリップス・上位フラッシュに当たりやすく、強い完成役として取り切る手ではありません。';
      risk=sizePct+'%pot / 弱フラッシュ / ペアボード / 相手圧力'+pressure+'回';
      suggest=over?'推奨: 25〜40%potの小さめ薄バリュー、またはチェック。レイズにはかなり素直にフォールド':'推奨: 小さめ薄バリュー。レイズにはかなり慎重';
    }else if(lowerTwoPair){
      verdict=over?'下のツーペアの大きめバリュー注意':'下のツーペアの実戦的バリュー';
      policy='下のツーペアはバリューを取れる手ですが、ナッツ級ではありません。相手がトップペアを降りないタイプなら打てますが、上位ツーペアや完成役に当たる時は大きく払いすぎないことが大事です。';
      risk=sizePct+'%pot / 下のツーペア / 相手圧力'+pressure+'回';
      suggest=over?'推奨: 50〜66%pot中心。75%pot以上は相手がJx/9xを広くコールする時だけ':'推奨: 50〜66%pot中心。相手がコールしすぎるなら少し大きめも可';
    }else{
      verdict=over?'強い完成役でもオーバーベット注意':'強い完成役の取り切り';
      policy='強い完成役はリバーで取り切ります。ただし全体ナッツでない時は、相手のレイズや上位完成役も少し見ます。';
      risk=sizePct+'%pot / '+(nonNutValue?'非ナッツの強い完成役':'ナッツ級')+' / 相手圧力'+pressure+'回';
      suggest=over?'推奨: 60〜90%pot中心。全体ナッツでない時はオールイン要求を慎重に':'推奨: 60〜100%pot中心。コールしてくれる下のバリューを想定してサイズを選ぶ';
    }
  }else if(action==='check'&&onePair&&!strongMade){
    lane='riverPotControlCheck';
    severity='good';
    verdict='ワンペアの自然なチェック';
    policy='リバーのワンペアはチェックでショーダウン価値を守るのが基本です。薄くバリューを取ろうとするよりも、ポット管理を優先してください。';
    risk='チェック / '+(completed?'完成寄りボード':'比較的静的なボード')+' / 相手圧力'+pressure+'回'+(multiway?' / マルチウェイ':'');
    suggest='推奨: チェックでショーダウンへ。打つなら小さめ薄バリューに限定';
  }else if(action==='check'&&(air||drawMiss)&&!strongMade){
    lane='riverGiveUp';
    severity='good';
    verdict='ミスドローの自然な諦め';
    policy='ブラフ条件が薄いリバーでは、エアーを無理に打たないことも勝つための判断です。';
    risk='チェック / '+(completed?'完成寄りボード':'比較的静的なボード')+' / 相手圧力'+pressure+'回'+(multiway?' / マルチウェイ':'');
    suggest='推奨: チェック。相手が降りる根拠がある時だけブラフ';
  }else if(action==='check'&&strongMade){
    lane='riverMissedValue';
    severity=role.isNut?'border':'good';
    verdict=role.isNut?'ナッツ級の取り逃し候補':'強いSDVのチェック許容';
    policy='強い手は基本的にリバーでバリューを取りに行きますが、非ナッツや相手が打つレンジを持つ時はチェックも混ざります。';
    risk='チェック / '+(role.isNut?'ナッツ級':'非ナッツ強手')+' / 相手圧力'+pressure+'回';
    suggest=role.isNut?'候補: 60〜80%potのバリューも混ぜる':'推奨: チェック許容。相手のベットにはサイズで対応';
  }else if(action==='fold'&&facing&&onePair&&!strongMade){
    lane='riverDisciplineFold';
    severity='good';
    verdict='ワンペアの良いフォールド';
    policy='リバーの大きいベットに対して、ワンペアを降ろせることは$2/$5でかなり重要なスキルです。';
    risk=sizePct+'%pot / '+(completed?'完成寄りボード':'比較的静的なボード')+' / 相手圧力'+pressure+'回';
    suggest='推奨: このフォールドを維持。相手が明確にブラフ過多の時だけコールを戻す';
  }
  if(lane&&opponentTendency){
    risk+=(risk?' / ':'')+'相手傾向='+opponentTendency.label;
    if(lane==='riverOnePairCatch'){
      if(opponentTendency.callTighten&&severity!=='bad'&&sizePct>=35){
        severity='bad';
        verdict='ブラフ不足相手へのワンペア受けすぎ';
        suggest='推奨: フォールド寄り。このタイプのリバーベットはバリューに寄せて見ます';
      }else if(opponentTendency.callLoosen&&severity==='bad'&&sizePct<=65&&!multiway&&line.density==='medium'){
        severity='border';
        verdict='ブラフ多め相手への境界コール';
        suggest='相手依存: ブラフ多め相手なら一部コールを戻す。大きすぎるサイズはまだフォールド寄り';
      }
    }else if(lane==='riverBluffCandidate'&&opponentTendency.bluffTighten){
      severity='bad';
      verdict='コール多め相手へのブラフ過多';
      suggest='推奨: チェックで諦める。降りにくい相手へ空振りを大きく打たない';
    }else if(lane==='riverThinValueSize'&&opponentTendency.valueLoosen&&severity==='border'&&sizePct<=65&&!multiway){
      severity='good';
      verdict='コール多め相手への薄バリュー';
      suggest='推奨: 40〜65%potの薄バリュー。レイズには慎重';
    }else if(lane==='riverValueTarget'&&opponentTendency.valueLoosen&&severity!=='bad'){
      suggest='推奨: コール多め相手にはやや大きめも可。相手が払う下の完成役を想定する';
    }else if(lane==='riverRaiseResponse'&&opponentTendency.raiseRespect&&severity!=='good'){
      if(severity==='border')severity='bad';
      suggest='推奨: フォールド寄り。このタイプのリバーレイズはかなり強く見ます';
    }
  }
  if(!lane)return null;
  const betDesign=liveCashRiverBetDesignProfile(role,lane,heroRaise?raiseSizePct:sizePct,completed,pressure,multiway,blocker,thinTarget,line,opponentTendency);
  if(betDesign){
    if(lane==='riverHeroRaise'&&heroRaise&&heroRaise.severity==='good'){
      betDesign.plan='raiseForStacks';
      betDesign.target=betDesign.target||'下の強い完成役、降りきれない強いワンペア';
      betDesign.foldOut='ほぼなし。降ろすより取り切りが目的';
      betDesign.sizeBand=betDesign.sizeBand&&betDesign.sizeBand!=='コール止め、または小さめレイズだけ'?betDesign.sizeBand:'2.5〜4倍前後';
      betDesign.severity='good';
    }
    risk+=(risk?' / ':'')+'設計='+betDesign.plan+' / 対象='+betDesign.target+' / サイズ帯='+betDesign.sizeBand;
    if(!(lane==='riverHeroRaise'&&heroRaise&&heroRaise.severity==='good')&&betDesign.severity==='bad'&&severity==='good')severity='border';
  }
  return{lane,label:'リバー金額',axis:'リバーの金額判断',street:'river',position:d.position||'',sizePct:heroRaise?raiseSizePct:sizePct,pressure,multiway,completed,onePair,weakPair,strongOnePair,strongMade,air,drawMiss,nonNutValue,blocker,thinTarget,line,opponentTendency,raiseResponse,heroRaise,betDesign,severity,verdict,policy,risk,suggest};
}
function liveCashRiverDecisionProfileText(profile){
  if(!profile)return'';
  return profile.verdict+'：'+profile.policy+' 注意: '+profile.risk;
}
