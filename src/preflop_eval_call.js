      }else if(d.action==='call'&&d.amount>0&&d.potOdds<0.5){
        const fourBetCallCtx=facingFourBetCtx(d);
        if(fourBetCallCtx){
          // [Codex fix 2026-05-28] This is not a cold call: hero already 3bet and is now facing a 4bet/4bet jam.
          const hcat4c=handCat(c1,c2);
          const isPair4c=c1.rank===c2.rank;
          const live4bCallNote='これはコールドコールではなく、自分の3BET後に相手の4BET'+(fourBetCallCtx.jamLike?' jam':'')+'を受けた局面です。海外ライブ$2/$5では4BETレンジはQQ+/AK寄りでブラフ不足になりやすく、必要EQだけでなく実効EQとインプライドなしを重く見ます。';
          if(hRank<=2){
            ev.quality='good';ev.deduction=0;
            ev.comment='正解。'+hd+'（'+rankStr+'）で4BET'+(fourBetCallCtx.jamLike?' jam':'')+'にコール。AA/KKは基本的にスタックオフ候補です。'+live4bCallNote;
            ev.suggest='推奨: コール/5BET jam';
            ev.strategyMix='Fold 0% / Call 45% / 5bet jam 55%';
          }else if(hRank<=6){
            const ded=hRank<=3?4:8;
            ev.quality=ded>=8?'ok':'good';ev.deduction=ded;score-=ded;
            ev.comment='境界。'+hd+'（'+rankStr+'）で4BET'+(fourBetCallCtx.jamLike?' jam':'')+'にコール。QQ/AK級は相手の4BET頻度とカバー関係次第で継続できますが、ライブ$2/$5ではフォールドも混ざります。'+live4bCallNote;
            ev.suggest='相手がタイトならフォールド寄り。ルースならコール/5BET jam';
            ev.strategyMix='Fold 25-45% / Call 35-55% / 5bet jam 10-25%';
          }else if(isPair4c&&hRank>=13&&hRank<=35){
            ev.quality='bad';ev.deduction=18;score-=18;
            ev.comment='【大きなミス】'+hd+'（'+rankStr+'）で4BET'+(fourBetCallCtx.jamLike?' jam':'')+'にコール。ミドル/小ポケットはセットマインのインプライドが消え、QQ+/AK寄りレンジに対して実効EQが足りません。'+live4bCallNote;
            ev.suggest='推奨: フォールド';
            ev.strategyMix='Fold 90-98% / Call 2-10% / 5bet 0%';
          }else{
            const ded=hcat4c==='premium_offsuit'||hcat4c==='premium_suited'?12:20;
            ev.quality='bad';ev.deduction=ded;score-=ded;
            ev.comment='【ミス】'+hd+'（'+rankStr+'）で4BET'+(fourBetCallCtx.jamLike?' jam':'')+'にコール。3BET前のハンド価値と、4BETを受けた後の継続価値は別物です。'+live4bCallNote;
            ev.suggest='推奨: フォールド。続けるなら一部5BET jam候補だけに絞る';
            ev.strategyMix='Fold 80-95% / Call 0-10% / 5bet jam 0-10%';
          }
        }else if(pos==='BB'){
          // COオープン+BTNフラット等、既にコーラーが入っているか確認
          const callersBB=prefDecs.filter(function(pd){return !pd.isHuman&&pd.action==='call'&&pd.facingRaise;}).length;
          const isMultiwayBB=callersBB>=1||(limpCount>=2);
          // マルチウェイ時はBBはより広くディフェンス可: ポットオッズ改善+マルチウェイエクイティ
          const bbGoodThresh=isMultiwayBB?30:20;
          const bbOkThresh=isMultiwayBB?80:50;
          const bbOkSuitedThresh=isMultiwayBB?90:65;
          const isSuited=human.holeCards.length===2&&human.holeCards[0].suit===human.holeCards[1].suit;
          const bbEffThresh=isSuited?bbOkSuitedThresh:bbOkThresh;
          const mwBBNote=isMultiwayBB?' （コーラー'+callersBB+'人+レイザーのマルチウェイ: BBはポットオッズ改善で広くディフェンス可）':'';
          if(hRank<=6&&d.facingRaise){
            ev.quality='ok';ev.deduction=8;score-=8;
            ev.comment='【3BET推奨】'+hd+'（'+rankStr+'）でBBからコール。コール自体は許容されますが、このクラスは高頻度で3BETが推奨されます。プレミアムハンドはBBからの3BETでイニシアチブを取り、ポストフロップでの主導権を確保するのが基本戦略です。'+mwBBNote;
            ev.suggest='推奨: 3BET（'+Math.round(d.toCall*3)+'チップ前後）';
            ev.strategyMix=threeBetChart.mix||flatChart.mix;
          }else if(flatChart.status==='pure'){ev.quality='good';ev.comment='正解。'+hd+'（'+rankStr+'）のBBディフェンスコールは参照レンジ内です。'+flatChart.mix+'。'+mwBBNote;ev.strategyMix=flatChart.mix;}
          else if(flatChart.status==='mix'){ev.quality='ok';ev.deduction=2;score-=2;ev.comment=hd+'（'+rankStr+'）のBBディフェンスは混合候補です。参照レンジでは '+flatChart.mix+'。相手が後ろ寄りで小さめならコール、EPや大きめならフォールド寄りです。'+mwBBNote;ev.strategyMix=flatChart.mix;}
          else if(hRank<=bbGoodThresh){ev.quality='good';ev.comment='正解。'+hd+'（'+rankStr+'）のBBディフェンスコールは妥当。3BETも選択肢。'+mwBBNote;ev.strategyMix=flatChart.mix;}
          else if(hRank<=bbEffThresh){ev.quality='good';ev.comment='正解。'+hd+'（'+rankStr+'）のBBディフェンス。'+mwBBNote+(isSuited?' スーテッドハンドは十分ディフェンス価値あり。':'');ev.strategyMix=flatChart.mix;}
          else{
            // 連結度ボーナス: J9o(gap=2)などはBBで許容範囲が広い
            const _bbGap=Math.abs(RANK_VAL[c1.rank]-RANK_VAL[c2.rank]);
            const _connBonus=_bbGap===1?25:_bbGap===2?15:_bbGap===3?8:0;
            const _mistakeThresh=98+_connBonus;
            if(hRank>=_mistakeThresh){
              const _isBroadway=Math.min(RANK_VAL[c1.rank],RANK_VAL[c2.rank])>=10;
              ev.deduction=_isBroadway?8:12;score-=ev.deduction;ev.quality='bad';
              ev.comment='【ミス】'+hd+'（'+rankStr+'）はBBでも参照レンジ外です。'+flatChart.mix+'。ポットオッズだけで守るとOOPで実現率が落ちます。'+mwBBNote;
              ev.suggest='推奨: フォールド';
              ev.strategyMix=flatChart.mix;
            }else if(hRank>=80){
              ev.quality='ok';ev.deduction=7;score-=7;
              ev.comment=hd+'（'+rankStr+'）のBBコール。連結度・プレイアビリティ考慮で完全な大ミスではありませんが、参照レンジでは '+flatChart.mix+'。ヘッズアップのOOPでは実現率が低く、ライブ$2/$5ではフォールド寄りに整理したい下限ハンドです。'+mwBBNote;
              ev.suggest='推奨: フォールド寄り。BTNが広く小さく開ける時だけ一部コール';
              ev.strategyMix=flatChart.mix;
            }else{
              ev.quality='ok';ev.comment=hd+'（'+rankStr+'）のBBコール。ボーダーラインのディフェンスです。参照レンジでは '+flatChart.mix+'。'+mwBBNote;ev.strategyMix=flatChart.mix;
            }
          }
        }else if(!d.facingRaise){
          if(hRank<=3&&d.amount>0){
            ev.quality='bad';ev.deduction=25;score-=25;
            ev.comment='【重大ミス】'+hd+'（'+rankStr+'）でのリンプ。ほぼ常にオープンレイズすべきプレミアムハンドです。リンプは相手に無料フロップを与え、ポットが小さくなってバリューを大幅に失います。プレミアムハンドほど積極的にポットを育てることが重要です。';
            ev.suggest=preflopSizePlan(hr,d,limpCount,false,false,pos).label;
            ev.strategyMix=openChart.mix;
          }else if(hRank<=10&&isInOpenRange){
            ev.quality='bad';ev.deduction=18;score-=18;
            ev.comment='【大きなミス】'+hd+'（'+rankStr+'）でのリンプ。高頻度でオープンレイズが推奨される強いハンドです。このクラスのハンドはリンプするとバリューを大きく損ないます。';
            ev.suggest=preflopSizePlan(hr,d,limpCount,false,false,pos).label;
            ev.strategyMix=openChart.mix;
          }else if(isInOpenRange){ev.quality='bad';ev.deduction=isMixOpen?7:10;score-=ev.deduction;ev.comment='【消極的】'+hd+'（'+rankStr+'）はリンプでなく'+pn+'からオープンレイズかフォールドに整理します。参照レンジでは '+openChart.mix+'。';ev.suggest=preflopSizePlan(hr,d,limpCount,false,false,pos).label;ev.strategyMix=openChart.mix;}
          else{
            const isSBComplete=pos==='SB';
            if(isSBComplete){
              const ded=handFrac>=0.75?6:handFrac>=0.55?4:2;
              ev.quality=ded>=6?'bad':'ok';ev.deduction=ded;score-=ded;
              ev.comment=(ded>=6?'【リーク】':'【注意】')+hd+'（'+rankStr+'）のSBコンプリート。SBは全ストリートOOPになり、初心者ほど実現率が落ちます。完成しにくいハンドはフォールド、参加するならレイズで主導権を取る意識が必要です。';
              ev.suggest=ded>=6?'推奨: フォールド':'推奨: フォールド寄り。卓がかなり受け身なら低頻度で完了';
            }else{
              const ded=handFrac>=0.70?12:handFrac>=0.50?10:7;
              ev.quality='bad';ev.deduction=ded;score-=ded;
              ev.comment='【初心者リーク】'+hd+'（'+rankStr+'）でのオープンリンプ。$2/$5でリンプ癖がつくと、強いプレイヤーにISOされ、ポジション不利・レンジ不利のままポットに参加し続けることになります。基本はフォールドかレイズです。';
              ev.suggest=handFrac<=posRangePct+0.05?preflopSizePlan(hr,d,limpCount,false,false,pos).label:'推奨: フォールド';
            }
          }
        }else if(pos==='SB'&&d.facingRaise){
          // ---- SBコールドコール: ライブ$2/$5ではフォールド優先だが、相手傾向と価格で低頻度ミックス ----
          const hcat_sb=handCat(c1,c2);
          const suited_sb=human.holeCards[0].suit===human.holeCards[1].suit;
          const callersBeforeSB=prefDecs.filter(function(pd){return !pd.isHuman&&pd.action==='call'&&pd.facingRaise;}).length;
          const mix=sbColdCallMix(hRank,hcat_sb,suited_sb,d.potOdds||0.99,callersBeforeSB);
          ev.strategyMix=fmtMix(mix);
          if(hRank<=12){
            ev.quality='bad';ev.deduction=15;score-=15;
            ev.comment='【大きなミス】'+hd+'（'+rankStr+'）でSBからコールドコール。'+mix.label+'。推奨頻度は '+fmtMix(mix)+'。SBは全ストリートOOPのため、プレミアムハンドは3BETでイニシアチブを取るのが基本です。';
            ev.suggest=preflopSizePlan(hr,d,limpCount,true,false,pos).label;
          }else if(hRank<=30){
            ev.quality='bad';ev.deduction=12;score-=12;
            ev.comment='【ミス】'+hd+'（'+rankStr+'）のSBコールドコール。'+mix.label+'。推奨頻度は '+fmtMix(mix)+'。SBはポストフロップで常にOOPのため、コールより3BET/フォールド中心が自然です。';
            ev.suggest='推奨: '+preflopSizePlan(hr,d,limpCount,true,false,pos).label+' またはフォールド';
          }else if(hRank<=55){
            const is3BetBluffSB=(hcat_sb==='suited_connector'||hcat_sb==='suited_ace')&&hRank>=40;
            ev.quality='bad';ev.deduction=10;score-=10;
            ev.comment='【ミス】'+hd+'（'+rankStr+'）のSBコールドコール。推奨頻度は '+fmtMix(mix)+'。'+(is3BetBluffSB?hd+'はスーテッド系として3BETブラフ候補になります。':'コールドコールは実現率が大幅に低下するためフォールド優先です。');
            ev.suggest='推奨: フォールド（または3BETブラフ）';
          }else if(mix.call>=10&&callersBeforeSB>=1&&(d.potOdds||1)<=0.30){
            const ded=8;ev.quality='ok';ev.deduction=ded;score-=ded;
            ev.comment='【境界】'+hd+'（'+rankStr+'）でSBからコールドコール。SBは最悪ポジションなのでフォールド優先ですが、COが広く、BTNがルースにコールし、BBが受け身ならごく少量のコールも残ります。推奨頻度は '+fmtMix(mix)+'。ただし実戦ではドミネートと実現率低下に注意。';
            ev.suggest='推奨: 基本フォールド。ルース卓では低頻度コール/一部3BET';
          }else{
            ev.quality='bad';ev.deduction=12;score-=12;
            ev.comment='【大きなミス】'+hd+'（'+rankStr+'）でSBからコールドコール。推奨頻度は '+fmtMix(mix)+'。弱いハンドかつ最悪ポジション（OOP全ストリート）でポットに参加するため、フォールドが大きく優先されます。';
            ev.suggest='推奨: フォールド';
          }
        }else{
          // ---- Facing raise call: multiway + dominated broadway analysis ----
          const suited2=human.holeCards[0].suit===human.holeCards[1].suit;
          const hcat=handCat(c1,c2);
          const isOOP=['SB','BB','UTG','UTG+1'].includes(pos);
          // Count players who called the same 3bet/raise (toCall > 2BB = called a raise)
          const otherCallers=prefDecs.filter(pd=>!pd.isHuman&&pd.action==='call'&&pd.facingRaise&&pd.toCall>hr.bigBlind*2).length;
          const estPlayersIn=otherCallers+2; // +1 raiser + human
          const isMultiway3bet=estPlayersIn>=3||limpCount>=2;
          const mw=mwFactor(estPlayersIn,isOOP);
          const isDomBway=hcat==='dominated_broadway';
          // Deduction cap: max 25 to avoid one-action wipeout
          const rioMultiplier=Math.min(mw,2.0);

          // Reverse implied odds penalty for dominated broadway OOP/multiway
          if(isDomBway&&isMultiway3bet&&isOOP){
            const ded=Math.min(25,Math.round(15*rioMultiplier));
            ev.quality='bad';ev.deduction=ded;score-=ded;
            ev.comment='【大きなミス】'+hd+'（'+rankStr+'）はオフスーツブロードウェイ系で逆インプライドオッズが大。OOP×マルチウェイ3betポットでは大幅EV損失（推定'+ded+'点）。ドミネートされやすく、ナッツになりにくい。';
            ev.suggest='推奨: フォールド（コールEVは大幅マイナス）';
          }else if(isDomBway&&isOOP){
            const ded=10;
            ev.quality='bad';ev.deduction=ded;score-=ded;
            ev.comment='【注意】'+hd+'（'+rankStr+'）はOOPでの3bet/レイズコール。参照レンジでは '+flatChart.mix+'。オフスーツブロードウェイはドミネートされやすく逆インプライドオッズが大きい。HU IPなら許容できるが、OOPでは基本フォールド推奨。';
            ev.suggest='推奨: フォールド';
            ev.strategyMix=flatChart.mix;
          }else if(isDomBway&&isMultiway3bet){
            const ded=12;
            ev.quality='bad';ev.deduction=ded;score-=ded;
            ev.comment='【注意】'+hd+'（'+rankStr+'）のマルチウェイコール。参照レンジでは '+flatChart.mix+'。オフスーツブロードウェイはマルチウェイで逆インプライドオッズが激増。ナッツを作りにくく、作れてもドミネートされる可能性が高い。';
            ev.suggest='推奨: フォールド';
            ev.strategyMix=flatChart.mix;
          }else if(isMultiway3bet&&isOOP&&handFrac>posRangePct-0.05){
            const ded=8;
            ev.quality='ok';ev.deduction=ded;score-=ded;
            ev.comment=hd+'（'+rankStr+'）のOOPマルチウェイコール（推定'+estPlayersIn+'人）。ナッツになりにくいハンドはequity realizationが低下しEV損失になりやすい。';
            ev.suggest='推奨: フォールドまたは3BET';
          }else if(hRank<=6){
            ev.quality='bad';ev.deduction=12;score-=12;
            ev.comment='【初心者リーク】'+hd+'（'+rankStr+'）でレイズに対してコール止め。プレミアムハンドは3BETでバリューを取り、相手に安くフロップを見せないことが重要です。コール止めはポットを小さくし、マルチウェイ化して事故率を上げます。';
            ev.suggest='推奨: 3BET（'+Math.max(Math.round(d.toCall*3),hr.bigBlind*6)+'T前後）';
          }else if(hRank<=12){
            ev.quality='ok';ev.deduction=6;score-=6;
            ev.comment='【3BET検討】'+hd+'（'+rankStr+'）のコール。強いハンドなのでコールだけでなく3BETで主導権を取る選択が有力です。初心者は強い手で受け身になりすぎないこと。';
            ev.suggest='推奨: 3BET頻度を高める';
            ev.strategyMix=threeBetChart.mix;
          }else{
            const coldCallPct=(function(){
              if(pos==='BTN')return 0.30;
              if(pos==='CO')return 0.24;
              if(pos==='HJ'||pos==='LJ')return 0.18;
              if(pos==='MP')return 0.16;
              if(pos==='UTG'||pos==='UTG+1')return 0.13;
              return Math.min(0.22,posRangePct*0.90);
            })();
            const suitedBonus=suited2?0.05:0;
            const playableCallPct=coldCallPct+suitedBonus;
            const dominatedOffsuit=(hcat==='dominated_broadway'||(!suited2&&Math.max(RANK_VAL[c1.rank],RANK_VAL[c2.rank])===14&&Math.min(RANK_VAL[c1.rank],RANK_VAL[c2.rank])<=9));
            if(handFrac<=Math.max(0.12,playableCallPct-0.06)&&!dominatedOffsuit){
              ev.quality='good';ev.comment='正解。'+hd+'（'+rankStr+'）の'+pn+'コールは妥当なディフェンスです。参照レンジでは '+flatChart.mix+'。';ev.strategyMix=flatChart.mix;
            }else if(handFrac<=playableCallPct&&!dominatedOffsuit){
              ev.quality='ok';ev.deduction=3;score-=3;ev.comment=hd+'（'+rankStr+'）の'+pn+'コールはボーダーライン。参照レンジでは '+flatChart.mix+'。$2/$5初心者向けにはコールより3BET/フォールドを優先してレンジを整理しましょう。';
              ev.suggest='推奨: 3BETまたはフォールドも検討';
              ev.strategyMix=flatChart.mix;
            }else{
              const weakOffsuit=!suited2&&handFrac>=0.38;
              const trashSuited=suited2&&handFrac>=0.40;
              const ded=weakOffsuit?14:trashSuited?12:8;
              ev.quality='bad';ev.deduction=ded;score-=ded;
              ev.comment='【初心者リーク】'+hd+'（'+rankStr+'）の'+pn+'コールドコール。参照レンジでは '+flatChart.mix+'。非BBのコールはポジション・後続プレイヤー・ドミネートリスクの影響が大きく、見た目のハンド順位より実戦EVが落ちます。特にオフスーツ/キッカー負けしやすいハンドは長期的に損になりやすいです。';
              ev.suggest='推奨: フォールド'+(suited2&&handFrac<=0.45?'、一部3BETブラフ':''); 
              ev.strategyMix=flatChart.mix;
            }
          }
        }
