      if(d.action==='fold'){
        const isFacingRaise=d.facingRaise;
        const isLimpPot=(!isFacingRaise)&&(d.toCall>0);
        if(isFacingRaise){
          const fourBetCtx=facingFourBetJamCtx(d);
          if(fourBetCtx){
            const hcat4=handCat(c1,c2);
            const isPair4=c1.rank===c2.rank;
            const live4bNote='CO/BTN/BBを含む3bet後の4BET jamは、海外ライブ$2/$5ではかなりバリュー過多です。必要EQだけでなく、QQ+/AK寄りレンジへの実効EQとインプライドなしを重く見ます。';
            if(hRank<=2){
              ev.quality='bad';ev.deduction=25;score-=25;
              ev.comment='【重大ミス】'+hd+'（'+rankStr+'）を4BET jamにフォールド。AA/KKは基本的にスタックオフ候補です。'+live4bNote;
              ev.suggest='推奨: コール/オールイン';
              ev.strategyMix='Fold 0% / Call 70% / 5bet 30%';
            }else if(hRank<=6){
              const ded=hRank<=3?10:4;
              ev.quality=ded>=10?'bad':'ok';ev.deduction=ded;score-=ded;
              ev.comment='【境界】'+hd+'（'+rankStr+'）の4BET jamへのフォールド。相手レンジがQQ+/AKに寄るライブ$2/$5ではフォールドも残りますが、プレミアム域なので相手傾向次第です。'+live4bNote;
              ev.suggest='相手がタイトならフォールド、ルースならコール/オールインも検討';
              ev.strategyMix='Fold 25% / Call 55% / 5bet 20%';
            }else if(isPair4&&hcat4!=='premium_pair'){
              ev.quality='good';ev.comment='正解。'+hd+'（'+rankStr+'）で3BET後に4BET jamを受けてフォールド。ミドル/小ポケットはセットマインのインプライドが消え、ライブ$2/$5の強い4BETレンジに対して実効EQが足りません。'+(fourBetCtx.coldCallers?' 途中にコールドコーラーが入った後の4BETはさらに強く見ます。':'')+' '+live4bNote;
              ev.suggest='推奨: フォールド';
              ev.strategyMix='Fold 95% / Call 5% / 5bet 0%';
            }else if(hRank<=12){
              ev.quality='ok';ev.comment='概ね正解。'+hd+'（'+rankStr+'）で4BET jamにフォールド。見た目は強いですが、ライブ$2/$5の4BET jamはブラフ不足になりやすく、AQ/JJ/TT級は相手次第でフォールド寄りです。'+live4bNote;
              ev.suggest='タイト相手はフォールド、明確にルースならコール検討';
              ev.strategyMix='Fold 65% / Call 30% / 5bet 5%';
            }else{
              ev.quality='good';ev.comment='正解。'+hd+'（'+rankStr+'）で4BET jamにフォールド。3BET前の参加価値と、強烈なリレイズを受けた後の継続価値は別物です。'+live4bNote;
              ev.suggest='推奨: フォールド';
              ev.strategyMix='Fold 90% / Call 10% / 5bet 0%';
            }
          }else if(prefBefore(d).some(function(x){return x.isHuman&&(x.action==='raise'||x.action==='allin');})&&prefBefore(d).filter(function(x){return x.action==='raise'||x.action==='allin';}).length>=2){
            const stackBB3f=Math.max(1,Math.round((d.playerChipsBefore||human.chips||((hr.bigBlind||5)*100))/(hr.bigBlind||5)));
            const vs3betFoldChart=preflopChartLookup('vs3bet',ht,pos,hr.players.length||6,{stackBB:stackBB3f,openerPos:openerPosForChart});
            const vs3betFoldNote='自分のオープン後に3BETを受けた局面です。'+Math.round(stackBB3f)+'BB帯のvs3BET参照レンジでは '+vs3betFoldChart.mix+'。';
            if(vs3betFoldChart.status==='pure'){
              ev.quality='bad';ev.deduction=14;score-=14;
              ev.comment='【消極的】'+hd+'（'+rankStr+'）を3BETにフォールド。'+vs3betFoldNote+' 継続レンジ内なので、コールか一部4BETを検討したいハンドです。';
              ev.suggest='推奨: コール/4BETを検討';
              ev.strategyMix=vs3betFoldChart.mix;
            }else if(vs3betFoldChart.status==='mix'){
              ev.quality='ok';ev.deduction=3;score-=3;
              ev.comment='境界。'+hd+'（'+rankStr+'）の3BETへのフォールド。'+vs3betFoldNote+' フォールドは悪くありませんが、相手が広く3BETするなら一部継続します。';
              ev.suggest='相手がタイトならフォールド、広いならコール/4BETを混ぜる';
              ev.strategyMix=vs3betFoldChart.mix;
            }else{
              ev.quality='good';
              ev.comment='正解。'+hd+'（'+rankStr+'）の3BETへのフォールド。'+vs3betFoldNote+' 参照レンジ外なので、無理にコールして難しいポストフロップへ行かない判断が良いです。';
              ev.suggest='推奨: フォールド';
              ev.strategyMix=vs3betFoldChart.mix;
            }
          }else if(pos==='SB'){
            const hcatFoldSB=handCat(c1,c2);
            const suitedFoldSB=human.holeCards[0].suit===human.holeCards[1].suit;
            const callersBeforeFoldSB=prefDecs.filter(function(pd){return !pd.isHuman&&pd.action==='call'&&pd.facingRaise;}).length;
            const mixFoldSB=sbColdCallMix(hRank,hcatFoldSB,suitedFoldSB,d.potOdds||0.99,callersBeforeFoldSB);
            ev.strategyMix=fmtMix(mixFoldSB);
            if(hRank<=12){
              ev.quality='bad';ev.deduction=16;score-=16;
              ev.comment='【大きなミス】'+hd+'（'+rankStr+'）をSBでレイズにフォールド。プレミアム域で、推奨頻度は '+fmtMix(mixFoldSB)+'。SBでも3BETでバリューを取るべきです。';
              ev.suggest=preflopSizePlan(hr,d,limpCount,true,false,pos).label;
            }else if(hRank<=30){
              ev.quality='ok';ev.deduction=3;score-=3;
              ev.comment=hd+'（'+rankStr+'）のSBフォールド。強ハンド域ですが、SBは全ストリートOOPのためコールではなく3BET/フォールド中心。推奨頻度は '+fmtMix(mixFoldSB)+'。';
              ev.suggest='3BETも検討: '+preflopSizePlan(hr,d,limpCount,true,false,pos).label;
            }else{
              const ded=mixFoldSB.fold>=70?0:3;
              ev.quality=ded?'ok':'good';ev.deduction=ded;score-=ded;
              ev.comment=(ded?'概ね正解。':'正解。')+hd+'（'+rankStr+'）のSBフォールド。SBは最悪ポジションでエクイティ実現率が低く、コールドコールは初心者ほど損になりやすい。推奨頻度は '+fmtMix(mixFoldSB)+'。';
              ev.suggest=mixFoldSB.raise>=15?'低頻度で3BETブラフ検討。コールはかなり低頻度':'推奨: フォールド';
            }
          }else if(hRank<=10){ev.quality='bad';ev.deduction=20;score-=20;ev.comment='【大きなミス】'+hd+'（'+rankStr+'）はほぼ全状況でコール/3BETすべき超強力ハンドです。';ev.suggest='推奨: 3BET';}
          else if(hRank<=20){ev.quality='bad';ev.deduction=10;score-=10;ev.comment='【やや消極的】'+hd+'（'+rankStr+'）はレイズへのコール/3BETを検討すべき強さです。';ev.suggest='推奨: コールまたは3BET';}
          else if(isInCallRange){ev.quality='ok';ev.deduction=5;score-=5;ev.comment=hd+'（'+rankStr+'）のレイズへのフォールド。'+pn+'のコールレンジ内（上位'+Math.round(callPct*100)+'%）です。';ev.suggest='推奨: コール検討';}
          // [Claude fix 2026-06-08] コールレンジ外のフォールドは'ok'ではなく'good': 正しい判断に複数ラインが成立するような誤表示をなくす
          else{ev.quality='good';ev.comment='正解。'+hd+'（'+rankStr+'）の'+pn+'レイズへのフォールド。コールレンジ外の弱いハンドはフォールドが正しい判断です。';}
        }else if(isLimpPot){
          if(isInOpenRange&&handFrac<=posRangePct-0.06){ev.quality='bad';ev.deduction=15;score-=15;ev.comment='【ミス】'+hd+'（'+rankStr+'）はリンプポットでもオーバーレイズを狙える強いハンドです。';ev.suggest='推奨: レイズ（'+(Math.round(d.toCall*3))+'チップ程度）';}
          else if(isInOpenRange){ev.quality='ok';ev.deduction=3;score-=3;ev.comment=hd+'（'+rankStr+'）のリンプポットフォールド。レイズかフォールドかは状況次第です。';}
          else{ev.quality='good';ev.comment='正解。'+hd+'（'+rankStr+'）のリンプポットフォールド。弱いハンドへの正当な判断です。';}
        }else{
          if(isPureOpen){ev.quality='bad';ev.deduction=25;score-=25;ev.comment='【大きなミス】'+hd+'（'+rankStr+'）は'+pn+'のコアオープンレンジです。参照レンジでは '+openChart.mix+'。フォールドは大きなEV損失です。';ev.suggest=recOpen;ev.strategyMix=openChart.mix;}
          else if(isMixOpen){ev.quality='ok';ev.deduction=4;score-=4;ev.comment=hd+'（'+rankStr+'）の'+pn+'フォールドは混合候補です。参照レンジでは '+openChart.mix+'。卓がタイトならオープン、後ろが強いならフォールドで調整します。';ev.suggest=recOpen;ev.strategyMix=openChart.mix;}
          else if(isInOpenRange&&handFrac<=posRangePct-0.09){ev.quality='bad';ev.deduction=22;score-=22;ev.comment='【大きなミス】'+hd+'（'+rankStr+'）は'+pn+'のオープン候補です。フォールドはEV損失です。';ev.suggest=recOpen;}
          else if(isInOpenRange){ev.quality='bad';ev.deduction=12;score-=12;ev.comment='【ミス】'+hd+'（'+rankStr+'）は'+pn+'のオープン候補です（目安: 上位'+Math.round(posRangePct*100)+'%）。';ev.suggest=recOpen;}
          else if(handFrac<=posRangePct+0.05){ev.quality='ok';ev.comment=hd+'（'+rankStr+'）の'+pn+'フォールドはボーダーライン（境界: 上位'+Math.round(posRangePct*100)+'%）。オープン推奨ですが状況次第。';}
          else if(handFrac>=posRangePct+0.12){ev.quality='good';ev.comment='正解。'+hd+'（'+rankStr+'）は'+pn+'のオープンレンジ外（上位'+Math.round(posRangePct*100)+'%まで）です。';}
          else{ev.quality='ok';ev.comment=hd+'（'+rankStr+'）の'+pn+'フォールドはボーダーライン（境界: 上位'+Math.round(posRangePct*100)+'%付近）。';}
        }
