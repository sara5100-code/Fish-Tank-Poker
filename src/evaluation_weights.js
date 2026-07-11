  // [Codex fix 2026-06-03] 判断軸ごとに減点の重みを変え、リバー判断とOOPチェックの教育効果を分ける。
  function applyDecisionAxisWeight(ev){
    const before=ev.deduction||0;
    if(!before)return 0;
    let next=before;
    const notes=[];
    if(ev.evalAxis==='リバーのコール/フォールド'){
      const weakOnePair=/ワンペア|トップペア|中・低ペア|ミドルペア|ボード.*ペア|下位ペア/.test(ev.comment||'');
      if(ev.quality==='bad')next=Math.round(next*(ev.action==='call'&&weakOnePair?1.30:1.15));
      else if(ev.quality==='ok')next=Math.round(next*(ev.action==='call'&&weakOnePair?1.18:1.10));
      notes.push('リバー判断は初心者リークに直結するため重めに採点');
    }else if(ev.evalAxis==='チェック頻度と主導権'){
      const rangeLow=ev.rangeAdv==='低'||ev.nutAdv==='低'||/OOP/.test(ev.comment||'');
      const rangeHigh=ev.rangeAdv==='高'||ev.nutAdv==='高';
      if(rangeLow){
        next=Math.round(next*0.70);
        notes.push('OOP/レンジ不利の自然なチェックは減点を軽く補正');
      }else if(rangeHigh&&ev.quality==='bad'){
        next=Math.round(next*1.15);
        notes.push('レンジ/ナッツ優位での取り逃しはやや重く採点');
      }
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before){
      ev.deduction=next;
      ev.axisWeightNote=notes.join('。');
      if(ev.axisWeightNote){
        ev.comment=(ev.comment||'')+' 【判断軸補正】'+ev.axisWeightNote+'。';
      }
    }
    return next-before;
  }
  // [Codex fix 2026-06-16] Turn/Riverの変化カードを、ワンペア過信や非ナッツ大サイズの評価に反映する。
  function applyBoardTextureTransitionWeight(ev){
    const p=ev.boardTextureTransitionProfile||null;
    if(!p)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.severity==='bad'){
      next=Math.max(next,p.lane==='call'?18:p.lane==='bet'?14:10);
      ev.quality='bad';
      notes.push(boardTextureTransitionProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='border'){
      next=Math.max(next,6);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(boardTextureTransitionProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='good'){
      if(before>0&&(p.lane==='check'||p.lane==='fold'))next=Math.min(next,4);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(boardTextureTransitionProfileText(p));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.boardTextureTransitionWeightNote=notes.join('。');
      ev.comment=(ev.comment||'')+' 【ボード変化】'+ev.boardTextureTransitionWeightNote;
    }
    return next-before;
  }
  // [Codex fix 2026-06-16] Range/Nut advantageを、ベット/チェック/コールの重みに反映する。
  function applyRangeNutAdvantageWeight(ev){
    const p=ev.rangeNutAdvantageProfile||null;
    if(!p)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.severity==='bad'){
      next=Math.max(next,p.lane==='call'?18:p.lane==='bet'?14:10);
      ev.quality='bad';
      notes.push(rangeNutAdvantageProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='border'){
      next=Math.max(next,6);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(rangeNutAdvantageProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='good'){
      if(before>0&&(p.lane==='check'||p.lane==='fold'||(p.lane==='bet'&&p.heroRangeAdv==='高')))next=Math.min(next,5);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(rangeNutAdvantageProfileText(p));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.rangeNutAdvantageWeightNote=notes.join('。');
      ev.comment=(ev.comment||'')+' 【レンジ/ナッツ優位】'+ev.rangeNutAdvantageWeightNote;
    }
    return next-before;
  }
  // [Codex fix 2026-06-16] 相手アクションによるレンジ更新を、コール/薄バリュー/ブラフ評価へ反映する。
  function applyRangeActionUpdateWeight(ev){
    const p=ev.rangeActionUpdateProfile||null;
    if(!p)return 0;
    const gtoMode=(typeof getRangeMode==='function'&&getRangeMode()==='gto');
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(gtoMode&&p.severity==='border'&&p.lane==='call'){
      ev.rangeActionUpdateWeightNote=rangeActionUpdateProfileText(p);
      ev.comment=(ev.comment||'')+' 【レンジ更新】'+ev.rangeActionUpdateWeightNote;
      return 0;
    }
    if(p.severity==='bad'){
      next=Math.max(next,p.lane==='call'?18:p.lane==='bet'?12:10);
      ev.quality='bad';
      notes.push(rangeActionUpdateProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='border'){
      next=Math.max(next,6);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(rangeActionUpdateProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='good'){
      if(before>0&&(p.lane==='check'||p.lane==='fold'||p.lane==='bet'))next=Math.min(next,5);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(rangeActionUpdateProfileText(p));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.rangeActionUpdateWeightNote=notes.join('。');
      ev.comment=(ev.comment||'')+' 【レンジ更新】'+ev.rangeActionUpdateWeightNote;
    }
    return next-before;
  }
  // [Codex fix 2026-06-20] ベットの目的が薄い時だけ追加補正する。既存のGTO/サイズ評価は温存。
  function applyPostflopBetPurposeWeight(ev){
    const p=ev.postflopBetPurposeProfile||null;
    if(!p||ev.street==='preflop')return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.severity==='bad'){
      next=Math.max(next,p.lane==='airBluff'||p.lane==='weakMadeBet'?14:12);
      ev.quality='bad';
      notes.push(postflopBetPurposeProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='border'){
      next=Math.max(next,5);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(postflopBetPurposeProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='good'){
      if(before>0&&(p.lane==='value'||p.lane==='semiBluff'||p.lane==='rangeCbet'||p.lane==='protectionValue'))next=Math.min(next,5);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(postflopBetPurposeProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.postflopBetPurposeWeightNote=notes.join('。');
      ev.comment=(ev.comment||'')+' 【ベット目的】'+ev.postflopBetPurposeWeightNote;
    }
    return next-before;
  }
  // [Codex fix 2026-06-21] ポストフロップのレイズ/チェックレイズは、通常ベットとは別に目的を確認する。
  function applyPostflopRaisePlanWeight(ev){
    const p=ev.postflopRaisePlanProfile||null;
    if(!p)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.severity==='bad'){
      next=Math.max(next,p.weakMade||p.air||p.weakDraw?14:12);
      ev.quality='bad';
      notes.push(postflopRaisePlanProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='border'){
      next=Math.max(next,6);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(postflopRaisePlanProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='good'){
      if(before>0&&(p.strongMade||p.strongDraw))next=Math.min(next,6);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(postflopRaisePlanProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.postflopRaisePlanWeightNote=notes.join('。');
      ev.comment=(ev.comment||'')+' 【レイズ判断】'+ev.postflopRaisePlanWeightNote;
    }
    return next-before;
  }
  // [Codex fix 2026-06-20] ターンの2発目は、フロップの目的をそのまま惰性で続けない。
  function applyPostflopBarrelPlanWeight(ev){
    const p=ev.postflopBarrelPlanProfile||null;
    if(!p)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.severity==='bad'){
      next=Math.max(next,p.lane==='barrel'?12:8);
      ev.quality='bad';
      notes.push(postflopBarrelPlanProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='border'){
      next=Math.max(next,4);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(postflopBarrelPlanProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='good'){
      if(before>0&&p.lane==='barrel')next=Math.min(next,5);
      if(ev.quality==='bad'&&p.lane==='check')ev.quality='ok';
      notes.push(postflopBarrelPlanProfileText(p));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.postflopBarrelPlanWeightNote=notes.join('。');
      ev.comment=(ev.comment||'')+' 【ターン継続】'+ev.postflopBarrelPlanWeightNote;
    }
    return next-before;
  }
  // [Codex fix 2026-06-20] フロップ/ターンのコールは、必要EQだけでなく次ストリートの実現率で見る。
  function applyPostflopDefensePlanWeight(ev){
    const p=ev.postflopDefensePlanProfile||null;
    if(!p)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.severity==='bad'){
      next=Math.max(next,p.lane==='call'?12:10);
      ev.quality='bad';
      notes.push(postflopDefensePlanProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='border'){
      next=Math.max(next,4);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(postflopDefensePlanProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='good'){
      if(before>0)next=Math.min(next,p.lane==='fold'?4:5);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(postflopDefensePlanProfileText(p));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.postflopDefensePlanWeightNote=notes.join('。');
      ev.comment=(ev.comment||'')+' 【受け方】'+ev.postflopDefensePlanWeightNote;
    }
    return next-before;
  }
  // [Codex fix 2026-06-20] コール後の未来計画が薄いコールは、単発の必要EQだけで肯定しない。
  function applyPostflopCallFuturePlanWeight(ev){
    const p=ev.postflopCallFuturePlanProfile||null;
    if(!p)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.severity==='bad'){
      next=Math.max(next,p.weakDraw?12:10);
      ev.quality='bad';
      notes.push(postflopCallFuturePlanProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='border'){
      next=Math.max(next,4);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(postflopCallFuturePlanProfileText(p));
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }else if(p.severity==='good'){
      if(before>0)next=Math.min(next,5);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(postflopCallFuturePlanProfileText(p));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.postflopCallFuturePlanWeightNote=notes.join('。');
      ev.comment=(ev.comment||'')+' 【次ストリート計画】'+ev.postflopCallFuturePlanWeightNote;
    }
    return next-before;
  }
  // [Codex fix 2026-06-05] Ring cash spots get their own weight layer so tournament phase logic does not carry the whole product.
  function applyLiveCashSpotWeight(ev){
    const p=ev.liveCashSpotProfile||null;
    if(!p||ev.tournamentPhase)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.lane==='openLimp'){
      next=Math.max(next,p.severity==='bad'?12:8);
      ev.quality='bad';
      notes.push(liveCashSpotProfileText(p));
      if(!ev.suggest)ev.suggest=p.suggest;
      if(p.mix)ev.strategyMix=p.mix;
    }else if(p.lane==='limpIsoCall'){
      next=Math.max(next,p.severity==='bad'?14:8);
      if(ev.quality==='good')ev.quality='ok';
      if(p.severity==='bad')ev.quality='bad';
      notes.push(liveCashSpotProfileText(p));
      if(!ev.suggest)ev.suggest=p.suggest;
      if(p.mix)ev.strategyMix=p.mix;
    }else if(p.lane==='sbColdCall'){
      if(p.severity==='bad')next=Math.max(next,10);
      else next=Math.max(next,5);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(liveCashSpotProfileText(p));
      if(!ev.suggest)ev.suggest=p.suggest;
    }else if(p.lane==='reraisedPot'&&p.severity==='bad'&&ev.action!=='fold'){
      next=Math.max(next,12);
      ev.quality='bad';
      notes.push(liveCashSpotProfileText(p));
      if(!ev.suggest)ev.suggest=p.suggest;
    }else if(p.lane==='limpIsoOopCheck'){
      if(before>0)next=Math.min(next,5);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(liveCashSpotProfileText(p));
      if(!ev.suggest)ev.suggest=p.suggest;
    }else if(p.lane==='oopDonk'){
      next=Math.max(next,p.severity==='bad'?12:6);
      if(p.severity==='bad')ev.quality='bad';
      else if(ev.quality==='good')ev.quality='ok';
      notes.push(liveCashSpotProfileText(p));
      if(!ev.suggest)ev.suggest=p.suggest;
    }else if(p.lane==='threeBetPotOop'){
      if(p.severity==='border'){
        next=Math.max(next,6);
        if(ev.quality==='good')ev.quality='ok';
      }else if(before>0){
        next=Math.min(next,8);
        if(ev.quality==='bad')ev.quality='ok';
      }
      notes.push(liveCashSpotProfileText(p));
      if(!ev.suggest)ev.suggest=p.suggest;
    }else if(p.lane==='riverOnePairCall'){
      if(p.severity==='bad'&&getRangeMode()==='gto'){
        // [feature 2026-06-10] GTOは均衡前提。EVを尊重し、+EV(good)はok止まり、-EV(既にbad)はbad維持。一律badにしない。
        next=Math.max(next,6);
        if(ev.quality==='good')ev.quality='ok';
      }else if(p.severity==='bad'){
        next=Math.max(next,18);
        ev.quality='bad';
        ev.comment=(ev.comment||'').replace(/^正解。?/,'').replace(/EV優位（[^。]+）で明確なコールです。/,'ライブ$2/$5補正後は、必要EQだけでは正当化しないブラフキャッチです。');
      }else{
        next=Math.max(next,6);
        if(ev.quality==='good')ev.quality='ok';
        ev.comment=(ev.comment||'').replace(/EV優位（[^。]+）で明確なコールです。/,'明確コールではなく、相手依存のブラフキャッチです。');
      }
      notes.push(liveCashSpotProfileText(p));
      if(!ev.suggest)ev.suggest=p.suggest;
    }else if(p.lane==='riverThinValue'){
      if(p.severity==='border'){
        next=Math.max(next,6);
        if(ev.quality==='good')ev.quality='ok';
      }else if(before>0){
        next=Math.min(next,5);
        if(ev.quality==='bad')ev.quality='ok';
      }
      notes.push(liveCashSpotProfileText(p));
      if(!ev.suggest)ev.suggest=p.suggest;
    }else if(p.lane==='multiwayPressure'){
      next=Math.max(next,6);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(liveCashSpotProfileText(p));
      if(!ev.suggest)ev.suggest=p.suggest;
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.liveCashSpotWeightNote=notes.join('。');
      if(ev.liveCashSpotWeightNote)ev.comment=(ev.comment||'')+' 【リング文脈】'+ev.liveCashSpotWeightNote+'。';
    }
    return next-before;
  }
  // [Codex fix 2026-06-06] Re-raised pots get a separate weight layer from generic preflop range and postflop initiative.
  function applyLiveCashReraisedPotWeight(ev){
    const p=ev.liveCashReraisedPotProfile||null;
    if(!p||ev.tournamentPhase)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.lane==='threeBetResponse'){
      if(p.severity==='bad'){
        next=Math.max(next,12);
        ev.quality='bad';
      }else if(p.severity==='good'){
        if(before>0)next=Math.min(next,5);
        if(ev.quality==='bad')ev.quality='ok';
      }else{
        next=Math.max(next,5);
        if(ev.quality==='good')ev.quality='ok';
      }
      notes.push(liveCashReraisedPotProfileText(p));
      if(p.mix&&!ev.strategyMix)ev.strategyMix=p.mix;
    }else if(p.lane==='fourBetResponse'){
      if(p.severity==='bad'){
        next=Math.max(next,18);
        ev.quality='bad';
      }else if(p.severity==='good'){
        if(ev.action==='fold'&&before>0)next=Math.min(next,4);
        if(ev.quality==='bad')ev.quality='ok';
      }else{
        next=Math.max(next,6);
        if(ev.quality==='good')ev.quality='ok';
      }
      notes.push(liveCashReraisedPotProfileText(p));
      if(p.mix)ev.strategyMix=p.mix;
    }else if(p.lane==='fiveBetDecision'){
      if(p.severity==='bad'){
        next=Math.max(next,16);
        ev.quality='bad';
      }else if(before>0){
        next=Math.min(next,6);
        if(ev.quality==='bad')ev.quality='ok';
      }
      notes.push(liveCashReraisedPotProfileText(p));
      if(p.mix)ev.strategyMix=p.mix;
    }else if(p.lane==='threeBetCallerOop'){
      if(p.severity==='bad'){
        next=Math.max(next,14);
        ev.quality='bad';
      }else if(p.severity==='good'){
        if(before>0)next=Math.min(next,ev.action==='fold'?2:5);
        if(ev.quality==='bad')ev.quality='ok';
      }else{
        next=Math.max(next,6);
        if(ev.quality==='good')ev.quality='ok';
      }
      notes.push(liveCashReraisedPotProfileText(p));
    }else if(p.lane==='threeBetAggressor'){
      if(p.severity==='good'){
        if(before>0)next=Math.min(next,6);
        if(ev.quality==='bad')ev.quality='ok';
      }else{
        next=Math.max(next,5);
        if(ev.quality==='good')ev.quality='ok';
      }
      notes.push(liveCashReraisedPotProfileText(p));
    }else if(p.lane==='threeBetEntry'){
      notes.push(liveCashReraisedPotProfileText(p));
      if(p.mix&&!ev.strategyMix)ev.strategyMix=p.mix;
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.liveCashReraisedPotWeightNote=notes.join('。');
      if(ev.liveCashReraisedPotWeightNote)ev.comment=(ev.comment||'')+' 【3BET/4BET文脈】'+ev.liveCashReraisedPotWeightNote+'。';
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }
    return next-before;
  }
  // [Codex fix 2026-06-06] Multiway spots are weighted separately so weak bets/calls are not hidden as generic sizing issues.
  function applyLiveCashMultiwayWeight(ev){
    const p=ev.liveCashMultiwayProfile||null;
    if(!p||ev.tournamentPhase)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.lane==='multiwayCheckControl'||p.lane==='multiwayDisciplineFold'){
      if(before>0)next=Math.min(next,4);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(liveCashMultiwayProfileText(p));
    }else if(p.lane==='multiwayBluffOverfreq'||p.lane==='multiwayOnePairCall'||p.lane==='multiwayWeakDrawCall'||p.lane==='multiwayAirCall'){
      next=Math.max(next,p.severity==='bad'?16:8);
      if(p.severity==='bad')ev.quality='bad';
      else if(ev.quality==='good')ev.quality='ok';
      notes.push(liveCashMultiwayProfileText(p));
    }else if(p.lane==='multiwayThinValue'||p.lane==='multiwayWeakDrawPressure'){
      next=Math.max(next,p.severity==='bad'?14:7);
      if(p.severity==='bad')ev.quality='bad';
      else if(ev.quality==='good')ev.quality='ok';
      notes.push(liveCashMultiwayProfileText(p));
    }else if(p.lane==='multiwayValueProtection'){
      if(p.severity==='good'){
        if(before>0)next=Math.min(next,6);
        if(ev.quality==='bad')ev.quality='ok';
      }else{
        next=Math.max(next,5);
        if(ev.quality==='good')ev.quality='ok';
      }
      notes.push(liveCashMultiwayProfileText(p));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.liveCashMultiwayWeightNote=notes.join('。');
      if(ev.liveCashMultiwayWeightNote)ev.comment=(ev.comment||'')+' 【マルチウェイ文脈】'+ev.liveCashMultiwayWeightNote+'。';
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }
    return next-before;
  }
  // [Codex fix 2026-06-05] Weight initiative separately so OOP checks are not mistaken for missed value.
  function applyLiveCashInitiativeWeight(ev){
    const p=ev.liveCashInitiativeProfile||null;
    if(!p||ev.tournamentPhase)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.lane==='oopNoInitiativeCheck'||p.lane==='pfrCheck'&&p.severity==='good'||p.lane==='ipFloatCheck'){
      if(before>0)next=Math.min(next,5);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(liveCashInitiativeProfileText(p));
    }else if(p.lane==='oopNoInitiativeDonk'){
      next=Math.max(next,p.severity==='bad'?12:6);
      if(p.severity==='bad')ev.quality='bad';
      else if(ev.quality==='good')ev.quality='ok';
      notes.push(liveCashInitiativeProfileText(p));
    }else if(p.lane==='pfrCbet'){
      if(p.severity==='border'){
        next=Math.max(next,5);
        if(ev.quality==='good')ev.quality='ok';
      }else if(before>0){
        next=Math.min(next,6);
        if(ev.quality==='bad')ev.quality='ok';
      }
      notes.push(liveCashInitiativeProfileText(p));
    }else if(p.lane==='pfrCheck'&&p.severity==='border'){
      next=Math.max(next,5);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(liveCashInitiativeProfileText(p));
    }else if(p.lane==='ipStab'){
      if(p.severity==='border'){
        next=Math.max(next,5);
        if(ev.quality==='good')ev.quality='ok';
      }
      notes.push(liveCashInitiativeProfileText(p));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.liveCashInitiativeWeightNote=notes.join('。');
      if(ev.liveCashInitiativeWeightNote)ev.comment=(ev.comment||'')+' 【主導権文脈】'+ev.liveCashInitiativeWeightNote+'。';
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }
    return next-before;
  }
  // [Codex fix 2026-06-05] Stack depth changes the meaning of one-pair and draw decisions in live cash.
  function applyLiveCashSprWeight(ev){
    const p=ev.liveCashSprProfile||null;
    if(!p||ev.tournamentPhase)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(p.lane==='deepSprOnePairCall'){
      if(p.severity==='bad'){
        next=Math.max(next,16);
        ev.quality='bad';
        ev.comment=(ev.comment||'').replace(/EV優位（[^。]+）で明確なコールです。/,'深いSPRでは明確コールではなく、相手の強いレンジをかなり意識する場面です。');
      }else if(p.severity==='good'){
        next=Math.min(next,5);
        if(ev.quality==='bad')ev.quality='ok';
      }else{
        next=Math.max(next,6);
        if(ev.quality==='good')ev.quality='ok';
      }
      notes.push(liveCashSprProfileText(p));
    }else if(p.lane==='deepSprOnePairBet'){
      if(p.severity==='bad'){
        next=Math.max(next,14);
        ev.quality='bad';
      }else{
        next=Math.max(next,5);
        if(ev.quality==='good')ev.quality='ok';
      }
      notes.push(liveCashSprProfileText(p));
    }else if(p.lane==='deepSprPotControl'){
      if(before>0)next=Math.min(next,5);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(liveCashSprProfileText(p));
    }else if(p.lane==='deepSprDrawPressure'){
      next=Math.max(next,p.severity==='bad'?12:6);
      if(p.severity==='bad')ev.quality='bad';
      else if(ev.quality==='good')ev.quality='ok';
      notes.push(liveCashSprProfileText(p));
    }else if(p.lane==='lowSprCommit'){
      if(p.severity==='good'){
        if(before>0)next=Math.min(next,6);
        if(ev.quality==='bad')ev.quality='ok';
      }else if(ev.action==='fold'){
        next=Math.max(next,10);
        if(ev.quality==='good')ev.quality='ok';
      }
      notes.push(liveCashSprProfileText(p));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.liveCashSprWeightNote=notes.join('。');
      if(ev.liveCashSprWeightNote)ev.comment=(ev.comment||'')+' 【SPR文脈】'+ev.liveCashSprWeightNote+'。';
      if(!ev.suggest&&p.suggest)ev.suggest=p.suggest;
    }
    return next-before;
  }
  // [Codex fix 2026-06-03] Tモードでは同じ判断軸でも序盤/中盤/バブル/FT/HUで減点の教育重みを変える。
  function applyTournamentPhaseWeight(ev){
    const before=ev.deduction||0;
    const earlyHu=ev.headsUpProfile||null;
    // [Codex fix 2026-06-05] HUの参加/防衛不足は、通常レンジ判定が正当フォールドにしてもHU文脈のミスとして先に扱う。
    if(!before&&ev.tournamentPhase==='HU'&&earlyHu&&earlyHu.severity==='bad'&&ev.action==='fold'){
      const next=earlyHu.lane==='sbFold'?18:earlyHu.lane==='bbFold'?16:10;
      ev.deduction=next;
      ev.quality='bad';
      ev.phaseWeightNote='HU「'+earlyHu.verdict+'」。'+earlyHu.policy+' '+earlyHu.risk;
      ev.comment=(ev.comment||'').replace(/^正解。?/,'')+' 【フェーズ判定】'+ev.phaseWeightNote+'。';
      ev.suggest=earlyHu.lane==='sbFold'?'推奨: レイズ/リンプ中心。弱すぎる手以外は参加頻度を確保':'推奨: BBは相手SBレンジに対して広めに防衛';
      return next-before;
    }
    if(!before||!ev.tournamentPhase)return 0;
    let next=before;
    const notes=[];
    const phase=ev.tournamentPhase;
    const stackBB=ev.stackBB||99;
    const facing=(ev.toCall||0)>0&&(ev.street!=='preflop'||ev.facingRaise);
    const covered=ev.coverState==='covered'||ev.coverState==='mixed_covered';
    const covering=ev.coverState==='covering'||ev.coverState==='mixed_covering';
    const bp=ev.bubbleProfile||null;
    const br=ev.bubbleIcmRange||null;
    const mp=ev.middleProfile||null;
    const fp=ev.finalTableProfile||null;
    const frp=ev.finalTableRangeProfile||(fp&&fp.rangeProfile)||null;
    const hp=ev.headsUpProfile||null;
    const late=['CO','BTN','SB'].includes(ev.position);
    const raiseLike=ev.action==='raise'||ev.action==='allin';
    const callCommitRatio=ev.playerChipsBefore?((ev.amount||ev.toCall||0)/Math.max(1,ev.playerChipsBefore)):0;
    const callOff=facing&&ev.action==='call'&&(callCommitRatio>=0.55||((ev.toCall||0)>=Math.max(1,(ev.playerChipsBefore||0)*0.55)));
    const nonBBFlat=ev.street==='preflop'&&facing&&ev.action==='call'&&ev.position!=='BB'&&!callOff;
    if(phase==='序盤'){
      if(ev.street==='preflop'&&ev.earlyProfile&&ev.earlyProfile.lane==='limp'){
        next=Math.max(ev.earlyProfile.severity==='bad'?10:6,Math.round(next*1.12));
        notes.push('序盤のオープンリンプは、'+(ev.earlyProfile.participationLeak||'レイズ/フォールドを曖昧にする参加')+'として重めに採点。推奨経路は'+ev.earlyProfile.recommendedRoute);
      }else if(ev.street==='preflop'&&ev.action==='call'&&facing&&ev.position!=='BB'){
        const ep=ev.earlyProfile||null;
        const mult=ep&&ep.severity==='bad'?1.20:ep&&ep.severity==='border'?1.08:1.10;
        next=Math.round(next*mult);
        notes.push(ep?'序盤コールドコール「'+ep.verdict+'」。'+ep.plan+'。'+(ep.speculative&&ep.speculative.type?ep.speculative.reason:ep.exceptionReason?ep.exceptionReason:(ep.risks&&ep.risks.length?ep.risks.join('・')+'を重視':'悪い参加レンジを早めに削ることを重視')):'序盤は飛び回避より、悪い参加レンジを早めに削ることを重視');
      }else if(ev.street==='preflop'&&ev.earlyProfile&&ev.earlyProfile.severity==='bad'&&(ev.action==='raise'||ev.action==='allin'||ev.action==='call')){
        next=Math.max(8,Math.round(next*1.12));
        notes.push('序盤参加レンジ外の参加は、中盤前に難しいSPRを作るため重めに採点');
      }else if(ev.street==='preflop'&&ev.action==='fold'&&!facing&&ev.earlyProfile&&ev.earlyProfile.severity==='good'&&ev.earlyProfile.marginPercent>=8){
        next=Math.round(next*1.08);
        notes.push('序盤でもコア参加レンジを降りすぎると、チップを増やす機会を失いやすい');
      }else if(ev.street!=='preflop'&&ev.earlyDeepSprProfile){
        const ds=ev.earlyDeepSprProfile;
        const mwText=ev.earlyMultiwayProfile?' 序盤マルチウェイでも、'+ev.earlyMultiwayProfile.policy:'';
        if(ds.lane==='bet'&&ds.severity==='bad'){
          next=Math.max(8,Math.round(next*1.16));
          notes.push('序盤の深いSPRでは、'+ds.policy+' '+ds.risk+mwText);
        }else if(ds.lane==='call'&&ds.severity!=='normal'){
          next=Math.round(next*(ds.severity==='bad'?1.14:1.08));
          notes.push('序盤の深いSPRではワンペア受けを必要EQだけで正当化しない'+mwText);
        }else if(ds.lane==='check'&&ds.severity==='good'){
          next=Math.min(6,Math.round(next*0.88));
          notes.push('序盤の深いSPRではワンペアの自然なポット管理チェックとして軽めに見る');
          if(ev.quality==='bad')ev.quality='ok';
        }
      }else if(ev.street!=='preflop'&&ev.earlyMultiwayProfile){
        const mw=ev.earlyMultiwayProfile;
        if(mw.lane==='bet'&&mw.severity==='bad'){
          next=Math.max(8,Math.round(next*1.18));
          notes.push('序盤マルチウェイでは、'+mw.policy+' '+mw.risk);
        }else if(mw.lane==='call'&&mw.onePair&&!mw.strong){
          next=Math.round(next*(mw.severity==='bad'?1.16:1.08));
          notes.push('序盤マルチウェイのワンペア受けは、後続ストリートの難しさを重めに見る');
        }else if(mw.lane==='check'&&mw.severity==='good'){
          next=Math.round(next*0.90);
          notes.push('序盤マルチウェイでは自然なポット管理チェックとして軽めに見る');
        }
      }else if(ev.street==='river'&&facing&&ev.action==='call'){
        next=Math.round(next*1.05);
        notes.push('序盤でもワンペア系の払いすぎは長期リークとして少し重めに採点');
      }
    }else if(phase==='中盤'){
      if(stackBB<=25&&ev.street==='preflop'&&ev.action==='call'&&facing&&ev.position!=='BB'){
        next=Math.round(next*(mp?mp.flatMultiplier:1.18));
        notes.push(mp?'中盤帯「'+mp.band+'」の非BBフラットは、'+mp.risk+'ため重めに採点。5軸: '+mp.deepAxes.slice(1,4).join(' / '):'中盤の浅い非BBコールは、3bet jam/foldに整理する価値が高いため重めに採点');
      }else if(stackBB<=25&&ev.street==='preflop'&&ev.action==='call'&&facing&&ev.position==='BB'){
        next=Math.round(next*0.88);
        notes.push(mp?'中盤帯「'+mp.band+'」ではBBはポットオッズ込みで守れるため、コール減点を少し軽く補正。'+mp.deepAxes[1]:'BBアンティ下のBB防衛は少し広く許容');
      }else if(stackBB<=25&&ev.street==='preflop'&&raiseLike){
        const attackMult=mp&&(mp.lane==='openJam'||mp.lane==='reshove')?mp.attackMultiplier:1.08;
        next=Math.round(next*attackMult);
        notes.push(mp?'中盤帯「'+mp.band+'」では、'+mp.policy+'ため攻撃系の減点を調整。'+mp.deepAxes[0]+' / '+mp.deepAxes[2]:'中盤は有効BBに対するサイズ/フォールドエクイティのミスをやや重く採点');
      }else if(stackBB<=25&&ev.street!=='preflop'&&ev.evalAxis==='リバーのコール/フォールド'){
        const spr=mp&&mp.postflopSPR!=null?mp.postflopSPR:null;
        next=Math.round(next*(spr!=null&&spr<=4?1.18:1.10));
        notes.push(mp?'中盤の低SPRではリバーの薄い受けが脱落リスクに直結しやすい。'+mp.deepAxes[4]:'中盤の低SPRではリバーの薄い受けが脱落リスクに直結しやすい');
      }else if(stackBB<=25&&ev.street!=='preflop'&&ev.evalAxis==='チェック頻度と主導権'&&mp&&mp.postflopSPR!=null&&mp.postflopSPR<=4){
        next=Math.round(next*0.92);
        notes.push('中盤の低SPRでは、ワンペア/SDVのポットコントロールも自然なためチェック減点を少し軽く補正。'+mp.deepAxes[4]);
      }else if(stackBB<=17&&ev.street==='preflop'&&ev.action==='fold'&&!facing&&['CO','BTN','SB'].includes(ev.position)){
        next=Math.round(next*1.12);
        notes.push(mp?'中盤帯「'+mp.band+'」では後ろ寄りのopen/open jam機会を逃しすぎない':'ショート帯の後ろ寄りフォールドはやや重く採点');
      }
    }else if(phase==='バブル'){
      if(facing&&ev.action==='call'){
        let mult=bp?bp.callMultiplier:(covered?1.38:1.25);
        if(callOff)mult+=0.18;
        if(nonBBFlat)mult+=0.10;
        if(bp&&bp.shorterExists&&!covering)mult+=0.10;
        if(br&&br.severity==='bad')mult+=0.12;
        next=Math.round(next*mult);
        const callType=callOff?'オールイン受け':nonBBFlat?'非BBフラット':'コール';
        notes.push(bp?'バブル立場「'+bp.archetype+'」の'+callType+'は、'+bp.risk+'を避けるため重く採点'+(br?'（'+br.laneLabel+'目安: '+br.verdict+'）':''):covered?'バブルでカバーされている薄いコールは通過率を大きく落とすため重く採点':'バブルはコール側が特にタイトになるため、薄い受けを重く採点');
      }else if(facing&&ev.action==='fold'){
        let mult=bp?bp.foldMultiplier:(covered?0.70:0.82);
        if(br&&br.severity==='bad')mult=Math.min(mult,0.65);
        else if(br&&br.severity==='good'&&br.lane==='callOff')mult=Math.max(mult,0.92);
        next=Math.round(next*mult);
        notes.push(bp?'バブル立場「'+bp.archetype+'」では、'+bp.policy+'ため、フォールド減点を調整'+(br?'（'+br.laneLabel+'目安: '+br.verdict+'）':''):'バブルでは薄いフォールドの価値が上がるため、コール推奨側の減点を軽く補正');
      }else if(raiseLike&&!facing&&covered){
        let mult=bp?bp.attackMultiplier:1.15;
        if(br&&br.severity==='bad')mult+=0.08;
        next=Math.round(next*mult);
        notes.push(bp?'バブル立場「'+bp.archetype+'」の攻撃下限を、'+bp.policy+'方針で補正'+(br?'（'+br.laneLabel+'目安: '+br.verdict+'）':''):'バブルでカバーされている側の下限オープン/jamは失敗時の痛みを重く見る');
      }else if(raiseLike&&!facing&&covering){
        let mult=bp?bp.attackMultiplier:0.92;
        if(br&&br.severity==='bad')mult+=0.06;
        else if(br&&br.severity==='good')mult-=0.04;
        next=Math.round(next*mult);
        notes.push(bp?'バブル立場「'+bp.archetype+'」では、'+bp.policy+'ため、攻撃系の減点を調整'+(br?'（'+br.laneLabel+'目安: '+br.verdict+'）':''):'バブルでカバーしている側は圧をかける価値が高く、攻撃ミスの減点を少し軽く見る');
      }
    }else if(phase==='FT'){
      if(facing&&ev.action==='call'){
        let mult=fp?fp.multiplier:(covered?1.28:1.16);
        if(frp&&frp.severity==='bad')mult*=frp.lane==='callOff'?1.18:1.10;
        else if(frp&&frp.severity==='good'&&(frp.opponent==='ショート'||frp.opponent==='下位スタック'))mult*=0.92;
        next=Math.round(next*mult);
        notes.push(fp?'FT「'+fp.verdict+'」。'+fp.policy+' '+fp.risk:'FTはペイジャンプが大きく、カバーされるコールの失敗を重めに採点');
        if(frp)notes.push('FTレンジ表「'+frp.verdict+'」。'+tournamentFinalTableRangeProfileText(frp));
      }else if(facing&&ev.action==='fold'){
        next=Math.round(next*(fp?fp.multiplier:0.82));
        notes.push(fp?'FT「'+fp.verdict+'」。'+fp.policy:'FTではペイジャンプを守るフォールドの価値を加味し、減点を軽く補正');
        if(frp&&frp.severity==='good')notes.push('FTレンジ表では継続候補だが、受け側のフォールドは相手依存で許容幅あり。'+tournamentFinalTableRangeProfileText(frp));
      }else if(late&&ev.street==='preflop'&&ev.action==='fold'&&!facing){
        next=Math.round(next*(fp?fp.multiplier:1.10));
        notes.push(fp?'FT「'+fp.verdict+'」。'+fp.risk:'FTでも後ろ寄りのアンティ回収機会を逃しすぎるとチップ不足になりやすい');
        if(frp&&frp.severity==='good')notes.push('FTレンジ表では先入れ候補。'+tournamentFinalTableRangeProfileText(frp));
      }else if(raiseLike&&!facing&&fp){
        let mult=fp.multiplier;
        if(frp&&frp.severity==='bad')mult*=1.08;
        else if(frp&&frp.severity==='good')mult*=0.96;
        next=Math.round(next*mult);
        notes.push('FT「'+fp.verdict+'」。'+fp.policy);
        if(frp)notes.push('FTレンジ表「'+frp.verdict+'」。'+tournamentFinalTableRangeProfileText(frp));
      }
    }else if(phase==='HU'){
      if(ev.action==='fold'){
        next=Math.round(next*(hp?hp.multiplier:1.28));
        if(hp&&hp.severity==='bad'&&hp.lane==='sbFold')next=Math.max(next,18);
        else if(hp&&hp.severity==='bad'&&hp.lane==='bbFold')next=Math.max(next,16);
        notes.push(hp?'HU「'+hp.verdict+'」。'+hp.policy+' '+hp.risk:'HUはレンジが大きく広がるため、降りすぎを重く採点');
      }else if(ev.action==='check'&&ev.quality==='bad'){
        next=Math.round(next*(hp?hp.multiplier:1.15));
        notes.push(hp?'HU「'+hp.verdict+'」。'+hp.policy:'HUでは主導権と小ベット頻度が高く、受け身すぎるチェックをやや重く採点');
      }else if(facing&&ev.action==='call'){
        next=Math.round(next*(hp?hp.multiplier:0.92));
        notes.push(hp?'HU「'+hp.verdict+'」。'+hp.policy:'HUではブラフ頻度と薄いバリューが増えるため、受けのミスを少し軽く見る');
      }else if(raiseLike&&hp){
        next=Math.round(next*hp.multiplier);
        notes.push('HU「'+hp.verdict+'」。'+hp.policy);
      }
    }else if(stackBB<=17&&ev.street==='preflop'&&ev.action==='call'&&facing&&ev.position!=='BB'){
      next=Math.round(next*1.15);
      notes.push('ショート帯は非BBフラットよりpush/fold整理を重視');
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before){
      ev.deduction=next;
      ev.phaseWeightNote=notes.join('。');
      if(ev.phaseWeightNote){
        ev.comment=(ev.comment||'')+' 【フェーズ補正】'+ev.phaseWeightNote+'。';
      }
    }
    return next-before;
  }
  // [Codex fix 2026-06-05] FTレンジ表が明確にレンジ外なら、基礎評価が甘くても最低減点と説明を作る。
  function applyFinalTableRangeWeight(ev){
    const frp=ev.finalTableRangeProfile||null;
    if(!frp||ev.tournamentPhase!=='FT'||ev.street!=='preflop')return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(frp.severity==='bad'&&ev.action!=='fold'){
      next=Math.max(next,frp.lane==='callOff'?18:10);
      ev.quality='bad';
      notes.push('FTレンジ表「'+frp.verdict+'」。'+tournamentFinalTableRangeProfileText(frp));
      if(frp.lane==='flat'){
        ev.comment='【FTレンジ外フラット】'+(frp.handType||'このハンド')+'はFTの非BBフラットとして広すぎます。'+(frp.role?frp.role+' ':'')+(frp.opponent?'vs '+frp.opponent+' ':'')+'では、コールで実現率勝負にするより、reshove/foldへ整理します。';
      }
      ev.suggest=frp.lane==='callOff'?'推奨: フォールド。CL級/同格への受けはかなりタイトにする':'推奨: フォールド寄り。先入れか押し返しの形を選ぶ';
    }else if(frp.severity==='border'&&ev.action!=='fold'){
      next=Math.max(next,6);
      if(ev.quality==='good')ev.quality='ok';
      notes.push('FTレンジ表「境界」。'+tournamentFinalTableRangeProfileText(frp));
    }else if(frp.severity==='good'&&ev.action==='fold'&&frp.lane!=='callOff'){
      next=Math.max(next,8);
      if(ev.quality==='good')ev.quality='ok';
      notes.push('FTレンジ表では先入れ候補。'+tournamentFinalTableRangeProfileText(frp));
    }
    if(frp.mix)ev.strategyMix=frp.mix;
    if(next!==before){
      ev.deduction=next;
      ev.phaseWeightNote=(ev.phaseWeightNote?ev.phaseWeightNote+'。':'')+notes.join('。');
      ev.comment=(ev.comment||'')+' 【FTレンジ補正】'+notes.join('。')+'。';
    }
    return next-before;
  }
  // [Codex fix 2026-06-04] ワンペアはRaw EQだけでなく、SPR・ボード・複数ストリート圧力で受けすぎ/打ちすぎを監査する。
  function applyOnePairProfileWeight(ev){
    const op=ev.onePairProfile||null;
    if(!op)return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(op.lane==='call'&&op.verdict==='bad'){
      next=Math.max(next,op.street==='river'?20:12);
      ev.quality='bad';
      ev.comment=(ev.comment||'').replace(/^正解。/,'').replace(/EV優位（[^。]+）で明確なコールです。/,'ワンペア監査後は、必要EQだけでは正当化しない受けすぎ候補です。');
      notes.push(onePairPressureProfileText(op));
      if(!ev.suggest)ev.suggest='推奨: フォールド寄り。相手が明確にブラフ過多の時だけコール';
    }else if(op.lane==='call'&&op.verdict==='border'){
      // [Claude fix 2026-06-10] strongOnePair(TPTK等)のborderはqualityを'good'から'ok'に落とさない。
      // EV+の強ペアコールをborderと判定した場合は軽微な注記のみ(deduction最大3)。
      if(op.strongOnePair){
        // [feature 2026-06-10] Liveモード: OOP×複数バレル×大サイズの強ワンペアborderはEV+でも「明確コール」ではないため good→ok に落とす。
        // GTOモード/IP/軽い圧力では good を維持(EV的に正解)。
        // [Codex fix 2026-06-12] ターン2発目の大きめベットにトップペアで受ける場面は、
        // EVが足りそうでも「明確コール」とは書かず、最低でも注意付き(ok)に落とす。
        if(op.mode==='live'&&((op.isOOP&&op.pressureCount>=2&&op.sizePct>=55)||(op.street==='turn'&&op.pressureCount>=2&&op.sizePct>=65))){
          next=Math.max(next,8);
          if(ev.quality==='good')ev.quality='ok';
          notes.push('ライブ$2/$5: OOPで複数ストリートの大ベットを受ける強ワンペアは、GTO上はインディファレントでも母集団のブラフ不足で薄め。コール頻度を下げる。');
        }else{
          next=Math.max(next,3);
          // quality: 'good'のままにする（EV+のTPTKコールは正解）
        }
      }else{
        next=Math.max(next,6);
        if(ev.quality==='good')ev.quality='ok';
      }
      ev.comment=(ev.comment||'').replace(/EV優位（[^。]+）で明確なコールです。/,'ワンペア監査後は、明確コールではなく相手依存のブラフキャッチです。');
      notes.push(onePairPressureProfileText(op));
      if(!ev.suggest)ev.suggest='相手依存: パッシブ相手にはフォールド寄り、ブラフ頻度が高い相手にはコール';
    }else if(op.lane==='bet'&&op.verdict==='bad'){
      next=Math.max(next,op.street==='river'?14:10);
      ev.quality='bad';
      notes.push(onePairPressureProfileText(op));
      if(!ev.suggest)ev.suggest='推奨: チェックまたは小〜中サイズ';
    }else if(op.lane==='bet'&&op.verdict==='border'){
      next=Math.max(next,5);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(onePairPressureProfileText(op));
    }else if(op.lane==='check'&&op.verdict==='good'&&before>0){
      next=Math.min(next,6);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(onePairPressureProfileText(op));
    }else if(op.lane==='fold'&&op.weakPair){
      // [Claude fix 2026-06-09] ボードペア/弱いワンペアでのフォールド:
      // evalFoldは生EQ(cat=1)で判断するため誤って'bad'になりやすい。正しいフォールドとして補正。
      if(op.verdict==='good'){
        next=Math.min(next,4);
        if(ev.quality==='bad')ev.quality='ok';
        ev.comment=(ev.comment||'').replace(/^正解。?/,'').replace(/EV損失.*?です。/,'ボードペアのフォールドは正しい判断です。');
        notes.push(onePairPressureProfileText(op));
        if(!ev.suggest)ev.suggest='推奨: フォールド。ボードペアでは相手の圧力に受け過ぎない';
      }else if(op.verdict==='border'){
        next=Math.min(next,8);
        if(ev.quality==='bad')ev.quality='ok';
        notes.push(onePairPressureProfileText(op));
      }
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.onePairWeightNote=notes.join('。');
      if(ev.onePairWeightNote){
        ev.comment=(ev.comment||'')+' 【ワンペア監査】'+ev.onePairWeightNote+'。';
      }
    }
    return next-before;
  }
  // [Codex fix 2026-06-06] リバー金額判断は、必要EQだけでコールや大きい薄バリューを正当化しないための最終補正。
  function applyLiveCashRiverDecisionWeight(ev){
    const rv=ev.liveCashRiverDecisionProfile||null;
    if(!rv||ev.tournamentPhase||ev.street!=='river')return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(rv.lane==='riverOnePairCatch'){
      if(rv.severity==='bad'&&getRangeMode()==='gto'){
        // [feature 2026-06-10] GTOはEV尊重。+EV(good)はok止まり、-EV(既にbad)はbad維持。
        next=Math.max(next,rv.strongOnePair?4:8);
        if(ev.quality==='good')ev.quality='ok';
        if(!ev.suggest)ev.suggest=rv.suggest;
      }else if(rv.severity==='bad'){
        next=Math.max(next,rv.sizePct>=75||rv.pressure>=2?24:20);
        ev.quality='bad';
        ev.comment=(ev.comment||'').replace(/^正解。?/,'').replace(/EV優位（[^。]+）で明確なコールです。/,'リバー金額監査後は、必要EQだけでは正当化しないブラフキャッチです。');
        if(!ev.suggest)ev.suggest=rv.suggest;
      }else{
        // [Claude fix 2026-06-10] strongOnePair(TPTK等)のborderはquality='good'のまま保持。
        // 弱ペアのborderのみok→降格させる。強ペアは軽微な注記で留める。
        if(rv.strongOnePair){
          next=Math.max(next,4);
          // [Codex fix 2026-06-19] 単発小さめサイズへの強ワンペアは、前段がbadでも悪手扱いにしない。
          // ただし「明確コール」ではなく、相手依存のブラフキャッチとして説明する。
          if(ev.quality==='bad'&&rv.pressure<=1&&!rv.multiway&&!(rv.blocker&&rv.blocker.severity==='bad')&&(rv.sizePct<=40||rv.opponentTendency&&rv.opponentTendency.callLoosen&&rv.sizePct<=65))ev.quality='ok';
        }else{
          next=Math.max(next,8);
          if(ev.quality==='good')ev.quality='ok';
        }
        ev.comment=(ev.comment||'').replace(/EV優位（[^。]+）で明確なコールです。|コールで問題ありません。/,'小さめなのでコール候補ですが、明確コールではなく相手依存のブラフキャッチです。');
        if(!ev.suggest)ev.suggest=rv.suggest;
      }
      notes.push(liveCashRiverDecisionProfileText(rv));
    }else if(rv.lane==='riverThinValueSize'){
      if(rv.severity==='bad'){
        next=Math.max(next,14);
        ev.quality='bad';
        if(!ev.suggest)ev.suggest=rv.suggest;
      }else if(rv.severity==='border'){
        next=Math.max(next,6);
        if(ev.quality==='good')ev.quality='ok';
      }else if(before>0){
        next=Math.min(next,5);
        if(ev.quality==='bad')ev.quality='ok';
      }
      notes.push(liveCashRiverDecisionProfileText(rv));
    }else if(rv.lane==='riverBluffCandidate'){
      if(rv.severity==='bad'){
        next=Math.max(next,14);
        ev.quality='bad';
        if(!ev.suggest)ev.suggest=rv.suggest;
      }else{
        next=Math.max(next,6);
        if(ev.quality==='good')ev.quality='ok';
      }
      notes.push(liveCashRiverDecisionProfileText(rv));
    }else if(rv.lane==='riverValueTarget'){
      if(rv.severity==='good'&&before>0){
        next=Math.min(next,6);
        if(ev.quality==='bad')ev.quality='ok';
      }else if(rv.severity==='border'){
        next=Math.max(next,5);
        if(ev.quality==='good')ev.quality='ok';
      }
      notes.push(liveCashRiverDecisionProfileText(rv));
    }else if(rv.lane==='riverRaiseResponse'){
      if(rv.severity==='bad'){
        next=Math.max(next,rv.raiseResponse&&/ナッツ級の降りすぎ/.test(rv.raiseResponse.verdict||'')?12:22);
        ev.quality='bad';
        ev.comment=(ev.comment||'').replace(/EV優位（[^。]+）で明確なコールです。|コールで問題ありません。/,'リバーでレイズされた後は、必要勝率だけでは正当化しにくい判断です。');
        if(!ev.suggest)ev.suggest=rv.suggest;
      }else if(rv.severity==='good'){
        if(ev.action==='fold'){
          next=Math.min(next,4);
          if(ev.quality==='bad')ev.quality='ok';
        }else if(before>0){
          next=Math.min(next,6);
          if(ev.quality==='bad')ev.quality='ok';
        }
        if(!ev.suggest)ev.suggest=rv.suggest;
      }else{
        next=Math.max(next,8);
        if(ev.quality==='good')ev.quality='ok';
        if(!ev.suggest)ev.suggest=rv.suggest;
      }
      notes.push(liveCashRiverDecisionProfileText(rv));
    }else if(rv.lane==='riverHeroRaise'){
      if(rv.severity==='bad'){
        next=Math.max(next,18);
        ev.quality='bad';
        if(!ev.suggest)ev.suggest=rv.suggest;
      }else if(rv.severity==='good'){
        if(before>0){
          next=Math.min(next,6);
          if(ev.quality==='bad')ev.quality='ok';
        }
        if(ev.quality!=='bad')ev.quality='good';
        if(!ev.suggest)ev.suggest=rv.suggest;
      }else{
        next=Math.max(next,8);
        if(ev.quality==='good')ev.quality='ok';
        if(!ev.suggest)ev.suggest=rv.suggest;
      }
      notes.push(liveCashRiverDecisionProfileText(rv));
    }else if(rv.lane==='riverPotControlCheck'||rv.lane==='riverGiveUp'||rv.lane==='riverDisciplineFold'){
      if(before>0){
        next=Math.min(next,rv.lane==='riverDisciplineFold'?4:5);
        if(ev.quality==='bad')ev.quality='ok';
      }
      notes.push(liveCashRiverDecisionProfileText(rv));
    }else if(rv.lane==='riverMissedValue'){
      if(rv.severity==='border'){
        next=Math.max(next,6);
        if(ev.quality==='good')ev.quality='ok';
      }else if(before>0){
        next=Math.min(next,6);
      }
      notes.push(liveCashRiverDecisionProfileText(rv));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.liveCashRiverDecisionWeightNote=notes.join('。');
      if(ev.liveCashRiverDecisionWeightNote)ev.comment=(ev.comment||'')+' 【リバー金額判断】'+ev.liveCashRiverDecisionWeightNote+'。';
    }
    return next-before;
  }
  // [Codex fix 2026-06-05] HUリバー専用に、薄いバリュー/ブラフキャッチ/ポット管理の重みを分ける。
  function applyHeadsUpRiverWeight(ev){
    const hp=ev.headsUpRiverProfile||null;
    if(!hp||ev.tournamentPhase!=='HU'||ev.street!=='river')return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if(hp.severity==='bad'){
      next=Math.max(next,hp.lane==='call'?16:hp.lane==='bet'?12:10);
      ev.quality='bad';
      notes.push(tournamentHeadsUpRiverProfileText(hp));
      if(hp.lane==='call'){
        ev.comment=(ev.comment||'').replace(/^正解。?/,'').replace(/EV優位（[^）]+）で明確なコールです。/,'HUリバー補正後は、必要EQだけでは正当化しないブラフキャッチです。');
        if(!ev.suggest)ev.suggest='推奨: 相手傾向次第でFold寄り。大サイズ・完成ボードではワンペア受けを絞る';
      }else if(hp.lane==='bet'&&!ev.suggest){
        ev.suggest='推奨: チェックまたは小〜中サイズ。ワンペアで大きく膨らませない';
      }
    }else if(hp.severity==='border'){
      next=Math.max(next,6);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(tournamentHeadsUpRiverProfileText(hp));
      if(hp.lane==='call'&&!ev.suggest)ev.suggest='相手依存: アグレッシブ相手はコール、パッシブ相手はフォールド寄り';
      else if(hp.lane==='check'&&!ev.suggest)ev.suggest='候補: 小さめ薄バリューも混ぜる';
    }else if(hp.severity==='good'&&before>0){
      next=Math.min(next,hp.lane==='check'?5:8);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(tournamentHeadsUpRiverProfileText(hp));
    }else if(hp.severity==='good'){
      notes.push(tournamentHeadsUpRiverProfileText(hp));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.headsUpRiverWeightNote=notes.join('。');
      if(ev.headsUpRiverWeightNote)ev.comment=(ev.comment||'')+' 【HUリバー補正】'+ev.headsUpRiverWeightNote+'。';
    }
    return next-before;
  }
  // [Codex fix 2026-06-05] FTポストフロップは、カバーされる側の薄い受け/打ちすぎを一般ワンペア監査より重く見る。
  function applyFinalTablePostflopWeight(ev){
    const fp=ev.finalTablePostflopProfile||null;
    if(!fp||ev.tournamentPhase!=='FT'||ev.street==='preflop')return 0;
    const before=ev.deduction||0;
    let next=before;
    const notes=[];
    if((fp.lane==='call'||fp.lane==='bet')&&fp.severity==='bad'){
      next=Math.max(next,fp.lane==='call'?(fp.street==='river'?22:16):14);
      ev.quality='bad';
      notes.push(tournamentFinalTablePostflopProfileText(fp));
      if(fp.lane==='call'){
        ev.comment=(ev.comment||'').replace(/^正解。/,'').replace(/EV優位（[^。]+）で明確なコールです。/,'FT補正後は、必要EQだけでは正当化しない受けすぎ候補です。');
        if(!ev.suggest)ev.suggest='推奨: フォールド寄り。FTで上位/同格にカバーされる受けはかなり絞る';
      }else if(!ev.suggest){
        ev.suggest='推奨: チェックまたは小さめ。カバーされる側は自分から大きくポットを作らない';
      }
    }else if((fp.lane==='call'||fp.lane==='bet')&&fp.severity==='border'){
      next=Math.max(next,8);
      if(ev.quality==='good')ev.quality='ok';
      notes.push(tournamentFinalTablePostflopProfileText(fp));
      if(!ev.suggest)ev.suggest=fp.lane==='call'?'相手依存: 上位スタック相手にはフォールド寄り':'サイズ抑制: 小〜中サイズまたはチェック';
    }else if(fp.lane==='check'&&fp.severity==='good'&&before>0){
      next=Math.min(next,6);
      if(ev.quality==='bad')ev.quality='ok';
      notes.push(tournamentFinalTablePostflopProfileText(fp));
    }else if(fp.lane==='call'&&fp.severity==='good'&&before>0){
      next=Math.min(next,8);
      notes.push(tournamentFinalTablePostflopProfileText(fp));
    }
    next=Math.max(0,Math.min(45,next));
    if(next!==before||notes.length){
      ev.deduction=next;
      ev.finalTablePostflopWeightNote=notes.join('。');
      if(ev.finalTablePostflopWeightNote)ev.comment=(ev.comment||'')+' 【FTポストフロップ補正】'+ev.finalTablePostflopWeightNote+'。';
    }
    return next-before;
  }
