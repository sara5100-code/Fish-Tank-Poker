  // ---- PREFLOP CONTEXT HELPERS ----
  const prefDecs=hr.decisions.filter(d=>d.street==='preflop');
  // Limpers: other players who called BB without facing a raise
  const limpCount=prefDecs.filter(d=>!d.isHuman&&d.action==='call'&&!d.facingRaise&&d.toCall>0).length;

  // Hand category for reverse implied odds analysis
  function handCat(c1,c2){
    const r1=RANK_VAL[c1.rank],r2=RANK_VAL[c2.rank];
    const s=c1.suit===c2.suit;
    const hi=Math.max(r1,r2),lo=Math.min(r1,r2);
    const gap=hi-lo;
    if(r1===r2)return r1>=12?'premium_pair':r1>=9?'mid_pair':'small_pair';
    // Premium offsuit: AKo,AQo,KQo — strong enough not to penalize
    if(!s&&hi>=13&&lo>=12)return 'premium_offsuit';
    if(s&&hi>=13&&lo>=12)return 'premium_suited'; // AKs,AQs,KQs
    if(s&&hi===14)return 'suited_ace'; // Axs
    if(s&&gap<=2)return 'suited_connector';
    // Dominated broadway: offsuit hands where lo<=J (kicker vulnerable to domination)
    // AJo,ATo,KJo,KTo,QJo,QTo,JTo,J9o,T9o etc
    if(!s&&hi>=10&&lo>=9&&lo<=11&&gap<=3)return 'dominated_broadway';
    // Ax offsuit with medium kicker (gap>3 case: ATo)
    if(!s&&hi===14&&lo>=9&&lo<=11)return 'dominated_broadway';
    return 'other';
  }

  // ストリート別の相手プレイヤー数（preflop以前にフォールドした分を除く）
  function oppsAtStreet(street){
    const sOrd=['preflop','flop','turn','river'];
    const si=sOrd.indexOf(street);
    const totalOpps=hr.players.filter(p=>!p.isHuman&&p.active).length;
    if(si<=0)return totalOpps||1;
    const foldedBefore=new Set();
    for(const dec of hr.decisions){
      if(sOrd.indexOf(dec.street)<si&&!dec.isHuman&&dec.action==='fold')
        foldedBefore.add(dec.playerName);
    }
    return Math.max(1,totalOpps-foldedBefore.size);
  }

  // Multiway 3bet pot factor: weight multiplier for OOP/multiway penalty
  function mwFactor(numIn,isOOP){
    if(numIn>=5)return isOOP?2.5:2.0;
    if(numIn>=4)return isOOP?2.0:1.6;
    if(numIn>=3)return isOOP?1.6:1.3;
    return isOOP?1.2:1.0;
  }
  function fmtMix(mix){
    return 'Fold '+mix.fold+'% / 3bet '+mix.raise+'% / Call '+mix.call+'%';
  }
  function preflopLineContext(dec){
    if(!dec||dec.street!=='preflop')return '';
    const pos=dec.position||'';
    const facing=!!(dec.facingRaise&&(dec.toCall||0)>0);
    const level=dec.pfActionBetLevel||dec.pfFacingBetLevel||0;
    const fbc=facingFourBetCtx(dec);
    if(fbc){
      // [Claude fix 2026-06-08] 5BET以上の場面は「4BET対応」ではなく「5BET以上対応」と表示
      const use5bet=(fbc.raiseCount||0)>=4||(dec.pfFacingBetLevel||0)>=5||(dec.pfActionBetLevel||0)>=5;
      if(dec.action==='fold')return use5bet?'5BET以上対応フォールド':'4BET対応フォールド';
      if(dec.action==='call')return use5bet?'5BET以上対応コール':'4BET対応コール';
      if(dec.action==='raise'||dec.action==='allin')return use5bet?'6BET以上':'5BET';
      return use5bet?'5BET以上対応':'4BET対応';
    }
    if(pos==='BB'&&facing)return 'BBディフェンス';
    // [Claude fix 2026-06-07] SBから3BET/4BETした場合はコールドコールではなく3BET/4BETとして判定
    // facing=trueでもaction=raiseなら先に3BET判定へ進める
    if(pos==='SB'&&facing&&dec.action==='call')return 'SBコールドコール';
    if((dec.action==='raise'||dec.action==='allin')&&facing){
      if(level>=5)return '5BET';
      if(level===4)return '4BET';
      return '3BET';
    }
    if((dec.action==='raise'||dec.action==='allin')&&!facing&&limpCount>0)return 'ISOレイズ';
    if((dec.action==='raise'||dec.action==='allin')&&!facing)return 'オープンレイズ';
    if(dec.action==='call'&&!facing&&(dec.toCall||0)>0)return pos==='SB'?'SBコンプリート':'オープンリンプ';
    if(dec.action==='call'&&facing)return 'コールドコール';
    if(dec.action==='fold'&&facing)return '対レイズフォールド';
    if(dec.action==='fold'&&!facing)return '未参加フォールド';
    return '';
  }
  function sbColdCallMix(hRank,hcat,isSuited,potOdds,callers){
    if(hRank<=12)return{fold:5,raise:85,call:10,label:'プレミアム域'};
    if(hRank<=30)return{fold:25,raise:60,call:15,label:'強ハンド域'};
    if(hRank<=55){
      const bluff=(hcat==='suited_connector'||hcat==='suited_ace');
      return bluff?{fold:55,raise:35,call:10,label:'3betブラフ候補'}:{fold:70,raise:20,call:10,label:'境界域'};
    }
    if(hcat==='other'&&!isSuited&&hRank<=115&&potOdds<=0.30&&callers>=1){
      return{fold:75,raise:15,call:10,label:'弱Axの低頻度参加'};
    }
    if(isSuited&&hRank<=95&&potOdds<=0.30&&callers>=1){
      return{fold:65,raise:20,call:15,label:'スーテッド低頻度参加'};
    }
    return{fold:88,raise:8,call:4,label:'フォールド優先'};
  }
  // [Codex fix 2026-05-26] 3bet前の判断と、4bet/5bet jamを受けた後の判断を分離する。
  function prefIndexOf(dec){return prefDecs.findIndex(function(x){return x===dec;});}
  function prefBefore(dec){
    const idx=prefIndexOf(dec);
    return idx>=0?prefDecs.slice(0,idx):[];
  }
  function lastAggBefore(dec){
    const before=prefBefore(dec).filter(function(x){return x.action==='raise'||x.action==='allin';});
    return before[before.length-1]||null;
  }
  function firstAggBefore(dec){
    return prefBefore(dec).find(function(x){return x.action==='raise'||x.action==='allin';})||null;
  }
  function facingFourBetJamCtx(dec){
    const before=prefBefore(dec);
    const humanAggIdx=before.map(function(x,i){return x.isHuman&&(x.action==='raise'||x.action==='allin')?i:-1;}).filter(function(i){return i>=0;}).pop();
    if(humanAggIdx==null)return null;
    const villainAggs=before.slice(humanAggIdx+1).filter(function(x){return !x.isHuman&&(x.action==='raise'||x.action==='allin');});
    if(!villainAggs.length)return null;
    const last=villainAggs[villainAggs.length-1];
    const raiseCount=before.filter(function(x){return x.action==='raise'||x.action==='allin';}).length;
    const coldCallers=before.slice(humanAggIdx+1).filter(function(x){return !x.isHuman&&x.action==='call'&&x.facingRaise;}).length;
    const jamLike=last.action==='allin'||(last.amount||0)>=(dec.playerChipsBefore||0)||((dec.toCall||0)>=Math.max((hr.bigBlind||5)*20,(dec.playerChipsBefore||0)*0.65));
    if(raiseCount>=3||jamLike)return{last,coldCallers,jamLike,raiseCount};
    return null;
  }
  function facingFourBetCtx(dec){
    const before=prefBefore(dec);
    const humanAggIdx=before.map(function(x,i){return x.isHuman&&(x.action==='raise'||x.action==='allin')?i:-1;}).filter(function(i){return i>=0;}).pop();
    if(humanAggIdx==null)return null;
    const villainAggs=before.slice(humanAggIdx+1).filter(function(x){return !x.isHuman&&(x.action==='raise'||x.action==='allin');});
    if(!villainAggs.length)return null;
    const raiseCount=before.filter(function(x){return x.action==='raise'||x.action==='allin';}).length;
    if(raiseCount<3)return null;
    const last=villainAggs[villainAggs.length-1];
    const coldCallers=before.slice(humanAggIdx+1).filter(function(x){return !x.isHuman&&x.action==='call'&&x.facingRaise;}).length;
    const jamLike=last.action==='allin'||(last.amount||0)>=(dec.playerChipsBefore||0)||((dec.toCall||0)>=Math.max((hr.bigBlind||5)*20,(dec.playerChipsBefore||0)*0.65));
    return{last,coldCallers,jamLike,raiseCount};
  }
  function live25ThreeBetPct(pos,openerPos,hcat,hRank){
    let pct=0.075;
    if(pos==='BTN'&&openerPos==='CO')pct=0.12;
    else if(pos==='BTN'&&(openerPos==='HJ'||openerPos==='LJ'))pct=0.105;
    else if(pos==='BTN'&&(openerPos==='MP'||openerPos==='UTG+1'))pct=0.085;
    else if(pos==='BTN'&&openerPos==='UTG')pct=0.070;
    else if((pos==='SB'||pos==='BB')&&(openerPos==='BTN'||openerPos==='CO'))pct=0.115;
    else if(pos==='CO'&&(openerPos==='HJ'||openerPos==='LJ'))pct=0.10;
    if(hcat==='mid_pair'&&['BTN','CO'].includes(pos)&&['CO','HJ','LJ'].includes(openerPos||''))pct=Math.max(pct,0.11);
    if(hcat==='small_pair')pct=Math.max(0.07,pct-0.015);
    return pct;
  }
