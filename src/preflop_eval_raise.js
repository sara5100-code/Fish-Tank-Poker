      }else if(d.action==='raise'||d.action==='allin'){
        const suited=human.holeCards[0].suit===human.holeCards[1].suit;
        const is3bet=d.facingRaise&&d.toCall>0;
        const pfRaiseCountBefore=(d.pfRaiseCountBefore!=null?d.pfRaiseCountBefore:prefBefore(d).filter(function(x){return x.action==='raise'||x.action==='allin';}).length);
        const is5bet=is3bet&&pfRaiseCountBefore>=3&&prefBefore(d).some(function(x){return x.isHuman&&(x.action==='raise'||x.action==='allin');});
        const isISO=!is3bet&&limpCount>=2;
        const isOOP_r=['SB','BB','UTG','UTG+1'].includes(pos);
        const hcat_r=handCat(c1,c2);
        const isDomBway_r=hcat_r==='dominated_broadway';
        const openerBefore=firstAggBefore(d);
        const openerPos=openerBefore?openerBefore.position:null;
        const actionLabel=is3bet?'3BET':(pos==='BB'?'3BET/レイズ':isISO?'ISOレイズ':'オープン');

        // レンジ内かどうかでの評価 (コンボフラクションベース)
        // [Codex fix 2026-05-26] 3BETレンジは固定6%ではなく、BTN vs COなどのスチール攻防で広げる。
        const threeBetPct3=is3bet?live25ThreeBetPct(pos,openerPos,hcat_r,hRank):0.06;
        const is3betRange=handFrac<=threeBetPct3;
        // ISO/open: posRangePctで判定 (+0.03はISOの余裕)
        const effectivePct=is3bet?threeBetPct3:isISO?posRangePct+0.03:posRangePct;
        const marginPct=effectivePct-handFrac; // 正=レンジ内, 負=レンジ外

        const openPlan=preflopSizePlan(hr,d,limpCount,is3bet,isISO,pos);
        const stdOpen=openPlan.target||Math.round(hr.bigBlind*2.5)||15;
        let sizeNote='';
        let sizePenalty=0;
        if(d.amount>0){
          if(is3bet){
            const std3bet=openPlan.target||Math.round(d.toCall*3);
            const lo=Math.round(d.toCall*2.4),hi=Math.round(d.toCall*3.8);
            if(d.amount<lo)sizeNote=' 3BETサイズ'+d.amount+'チップは小さめ（推奨: '+std3bet+'チップ前後）。';
            else if(d.amount>hi)sizeNote=' 3BETサイズ'+d.amount+'チップはやや大きめ（推奨: '+std3bet+'チップ前後）。';
            else sizeNote=' 3BETサイズ（相手の約'+Math.round(d.amount/d.toCall*10)/10+'倍）は適切。';
          }else if(isISO){
            const isoBase=openPlan.target||Math.round(hr.bigBlind*(3+limpCount));
            if(d.amount<isoBase*0.7)sizeNote=' ISOサイズ'+d.amount+'チップは小さめ（推奨: '+isoBase+'チップ前後）。';
            else if(d.amount>isoBase*1.6)sizeNote=' ISOサイズ'+d.amount+'チップはやや大きめ（推奨: '+isoBase+'チップ前後）。';
            else sizeNote=' ISOサイズ（'+limpCount+'リンパー対）はほぼ適切。';
          }else if(pos!=='BB'){
            const tctxSize=hr.tournamentContext&&hr.tournamentContext.enabled?hr.tournamentContext:null;
            const tStackBB=tctxSize?Math.max(1,Math.round((d.playerChipsBefore||((tctxSize.stackBB||25)*hr.bigBlind))/hr.bigBlind)):null;
            if(tctxSize&&tStackBB<=25){
              const openBB=d.amount/hr.bigBlind;
              if(openBB<1.9){
                sizeNote=' トーナメント有効'+tStackBB+'BBのオープンサイズ'+openBB.toFixed(1)+'BBは小さすぎます（推奨: 2.0〜2.3BB）。';
                sizePenalty=Math.max(sizePenalty,4);
              }else if(openBB>2.4){
                sizeNote=' トーナメント有効'+tStackBB+'BBのオープンサイズ'+openBB.toFixed(1)+'BBは大きめ（推奨: 2.0〜2.3BB）。BBアンティ環境では小さめで十分です。';
                sizePenalty=Math.max(sizePenalty,5);
              }else{
                sizeNote=' トーナメント有効'+tStackBB+'BBのオープンサイズ（'+openBB.toFixed(1)+'BB）は適切。';
              }
            }else if(d.amount>0&&d.amount<=hr.bigBlind*2.2){
              sizeNote=' 【ミニレイズNG】オープンサイズ'+d.amount+'チップはBBの'+Math.round(d.amount/hr.bigBlind*10)/10+'倍（ミニレイズ）。標準的には2.5〜3BBが推奨。ミニレイズは相手に非常に有利なポットオッズを与え、全員がコールしやすくなりマルチウェイを招く。';
              sizePenalty=Math.max(sizePenalty,8);
            }else if(d.amount<stdOpen*0.8)sizeNote=' オープンサイズ'+d.amount+'チップは小さめ（推奨: '+stdOpen+'〜'+(stdOpen+5)+'チップ）。';
            else if(d.amount>stdOpen*1.8)sizeNote=' オープンサイズ'+d.amount+'チップはやや大きめ（推奨: '+stdOpen+'〜'+(stdOpen+5)+'チップ）。';
            else sizeNote=' サイズ（'+Math.round(d.amount/hr.bigBlind*10)/10+'BB）は適切。';
          }
        }

        let isoNote='';
        if(isISO&&isOOP_r&&isDomBway_r){
          isoNote=' ただし'+hd+'はOOP ISOでは逆インプライドオッズが大きい点に注意。';
        }else if(isISO&&isOOP_r&&limpCount>=3){
          isoNote=' '+limpCount+'リンパーへのOOP ISOはマルチウェイ化リスクあり。';
        }else if(isISO){
          isoNote=' ISOレイズ（'+limpCount+'リンパー相手）。';
        }

        // スーテッドエースの3BETブラフ (A5s-A2s)
        const is3betBluffOK=is3bet&&hcat_r==='suited_ace'&&['BTN','CO','HJ','SB','BB'].includes(pos)&&hRank>=40&&hRank<=60;
        const isBtnLatePair3bet=is3bet&&pos==='BTN'&&['CO','HJ','LJ'].includes(openerPos||'')&&c1.rank===c2.rank&&hRank>=13&&hRank<=35;
        const isLowSuitedStealOpen=!is3bet&&!isISO&&d.action==='raise'&&suited&&Math.max(RANK_VAL[c1.rank],RANK_VAL[c2.rank])<=7&&Math.abs(RANK_VAL[c1.rank]-RANK_VAL[c2.rank])<=3&&['CO','BTN','SB'].includes(pos);
        if(is5bet){
          // [Codex fix 2026-05-28] After hero 3bets and faces a 4bet, another raise is a 5bet, not a fresh 3bet.
          const stackBB5b=Math.max(1,Math.round((d.playerChipsBefore||human.chips||((hr.bigBlind||5)*100))/(hr.bigBlind||5)));
          const vs4betRaiseChart=preflopChartLookup('vs4bet',ht,pos,hr.players.length||6,{stackBB:stackBB5b,openerPos});
          const vs4betNote=' '+Math.round(stackBB5b)+'BB帯のvs4BET参照レンジでは '+vs4betRaiseChart.mix+'。';
          if(vs4betRaiseChart.status==='pure'){
            ev.quality='good';ev.deduction=0;
            ev.comment='正解。'+hd+'（'+rankStr+'）の5BET/オールイン。自分の3BET後に4BETを受けた局面で、継続レンジ内の強いハンドです。'+vs4betNote;
            ev.suggest='推奨: 5BET jam / コール';
            ev.strategyMix=vs4betRaiseChart.mix;
          }else if(vs4betRaiseChart.status==='mix'){
            const ded=hRank<=3?4:10;
            ev.quality=ded>=10?'bad':'ok';ev.deduction=ded;score-=ded;
            ev.comment='境界。'+hd+'（'+rankStr+'）の5BET。4BETレンジがQQ+/AK寄りの相手には慎重に。相手の4BET頻度が高い時だけ強く継続します。'+vs4betNote;
            ev.suggest='相手がタイトならコール/フォールド寄り。5BET jamは相手依存';
            ev.strategyMix=vs4betRaiseChart.mix;
          }else{
            ev.quality='bad';ev.deduction=18;score-=18;
            ev.comment='【ミス】'+hd+'（'+rankStr+'）の5BET。3BETへの4BETはライブ$2/$5ではかなり強く、広い3BETレンジの感覚で押し返すと大きなEV損失になりやすいです。'+vs4betNote;
            ev.suggest='推奨: フォールド';
            ev.strategyMix=vs4betRaiseChart.mix;
          }
        }else if(isBtnLatePair3bet){
          ev.quality='good';
          ev.comment='正解寄り。'+hd+'（'+rankStr+'）のBTN 3BETは、'+(openerPos||'後ろ寄り')+'オープンに対して十分ありえるミックスです。標準はコール主体ですが、ポジションを持って主導権を取り、COの広いオープンを罰する3BETも自然です。'+sizeNote;
          ev.suggest='標準: コール。攻めるなら3BET（'+(openPlan.target||Math.round(d.toCall*3))+'T前後）。4BETには基本フォールド';
          ev.strategyMix='Fold 0-10% / 3bet 20-40% / Call 50-70%';
        }else if(is3betBluffOK){
          ev.quality='ok';ev.comment='スーテッドエースの3BETブラフ（'+hd+'、'+rankStr+'）。A5s-A2s等はGTO的に標準的なブラフ3BET候補です。特にブラインド対スチールではAブロッカー効果があり、コールより3BET/フォールドの混合に向きます。'+sizeNote;
          ev.strategyMix=['SB','BB'].includes(pos)?'Fold 55% / 3bet 40% / Call 5%':'Fold 45% / 3bet 45% / Call 10%';
        }else if(isLowSuitedStealOpen&&marginPct>=0){
          ev.quality='good';ev.comment='正解寄り。'+hd+'（'+rankStr+'）の'+pn+' '+actionLabel+'は、後ろがタイトなら参加できるスチール下限寄りのハンドです。コアレンジではなく、ブラインドが広く守る卓ではフォールドも混ぜます。'+sizeNote+isoNote;
          ev.strategyMix=pos==='BTN'?'Fold 35-50% / Raise 50-65% / Call 0%':'Fold 45-65% / Raise 35-55% / Call 0%';
        }else if(marginPct>=0.09&&!(isISO&&isOOP_r&&isDomBway_r)){
          ev.quality='good';ev.comment='正解。'+hd+'（'+rankStr+'）の'+pn+' '+actionLabel+'はコアレンジです。'+sizeNote+isoNote;
        }else if(marginPct>=0.03&&!(isISO&&isOOP_r&&isDomBway_r)){
          ev.quality='good';ev.comment='正解。'+hd+'（'+rankStr+'）の'+pn+' '+actionLabel+'は妥当です。'+sizeNote+isoNote;
        }else if(marginPct>=0&&isISO&&isOOP_r&&isDomBway_r){
          const ded=5;ev.quality='ok';ev.deduction=ded;score-=ded;
          ev.comment='【ボーダー】'+hd+'（'+rankStr+'）の'+pn+' '+actionLabel+'はOOPオフスーツブロードウェイのISOで利益幅が薄い。'+sizeNote+isoNote;
        }else if(marginPct>=-0.03){
          const ded=isISO&&isOOP_r&&isDomBway_r?8:4;
          ev.quality=ded>=8?'bad':'ok';ev.deduction=ded;score-=ded;
          ev.comment='【ボーダー】'+hd+'（'+rankStr+'）の'+pn+' '+actionLabel+'はボーダーライン（境界: 上位'+Math.round(effectivePct*100)+'%）。'+(!suited&&!is3bet?'オフスーツは弱め。':'')+sizeNote+isoNote;
        }else if(marginPct>=-0.07){
          ev.quality='bad';ev.deduction=10;score-=10;
          ev.comment='【注意】'+hd+'（'+rankStr+'）の'+pn+' '+actionLabel+'はレンジ外です（境界: 上位'+Math.round(effectivePct*100)+'%、現在'+Math.round(handFrac*100)+'%相当）。'+sizeNote+isoNote;
          ev.suggest='推奨: フォールドまたは慎重に';
        }else{
          ev.quality='bad';ev.deduction=15;score-=15;
          ev.comment='【ミス】'+hd+'（'+rankStr+'）の'+pn+' '+actionLabel+'は弱すぎます（上位'+Math.round(effectivePct*100)+'%レンジ外）。';
          ev.suggest='推奨: フォールド';
        }
        if(sizePenalty>0){
          const already=ev.deduction||0;
          const add=Math.max(0,sizePenalty-already);
          if(add>0){ev.deduction=already+add;score-=add;}
          if(ev.quality==='good')ev.quality='ok';
          if(!ev.suggest)ev.suggest=openPlan.label||'推奨: 2.5〜3BBの標準オープンサイズ';
        }
