    if(d.street==='preflop'){
      ev.lineContext=preflopLineContext(d);
      if(!human.holeCards||human.holeCards.length<2)continue;
      const c1=human.holeCards[0],c2=human.holeCards[1];
      const ht=handType(c1,c2),hd=handDesc(c1,c2);
      const hRank=HAND_STRENGTH[ht]||169; // 表示用ランク (1=最強, 169=最弱)
      const handFrac=HAND_COMBO_FRAC[ht]||0.99; // コンボ累積比 (0=最強側)
      const pos=d.position||'MP';
      // $2/$5ライブキャッシュ基準のポジション別カットオフ (コンボ数ベース)
      const posRangePct=live25OpenPct(pos,hr.players.length||6);
      const callPct=Math.min(0.70,posRangePct*1.5);
      const openChart=preflopChartLookup('open',ht,pos,hr.players.length||6,{});
      const preBefore=prefDecs.slice(0,prefDecs.indexOf(d));
      const firstPreAgg=preBefore.find(function(x){return x.street==='preflop'&&(x.action==='raise'||x.action==='allin');});
      const openerPosForChart=firstPreAgg?firstPreAgg.position:'';
      const flatChart=preflopChartLookup('flat',ht,pos,hr.players.length||6,{openerPos:openerPosForChart});
      const threeBetChart=preflopChartLookup('threeBet',ht,pos,hr.players.length||6,{openerPos:openerPosForChart,polar:true});
      const isInOpenRange=openChart.status==='pure'||openChart.status==='mix'||handFrac<=posRangePct;
      const isPureOpen=openChart.status==='pure';
      const isMixOpen=openChart.status==='mix';
      const isInCallRange=flatChart.status==='pure'||flatChart.status==='mix'||handFrac<=callPct;
      // [Claude fix 2026-06-08] パーセンタイルはコンボ加重(handFrac)ではなくランクベースで表示
      // 例: 130位/169 → 上位77%相当（77%のハンドタイプは同等以上の強さ）
      const rankStr='全169手中'+hRank+'位(上位'+Math.round(hRank/169*100)+'%相当)';
      const pn=pos==='BB'?'BB':''+pos;
      const recOpen=preflopSizePlan(hr,d,limpCount,false,false,pos).label;
      // FISH_TANK_PREFLOP_EVAL_FOLD_MODULE
      // FISH_TANK_PREFLOP_EVAL_CALL_MODULE
      // FISH_TANK_PREFLOP_EVAL_RAISE_MODULE
      }else{
        ev.quality='ok';ev.comment=hd+'（'+rankStr+'）の'+pn+' '+({fold:'フォールド',call:'コール',check:'チェック',raise:'レイズ',allin:'オールイン'}[d.action]||d.action)+'。';
      }
