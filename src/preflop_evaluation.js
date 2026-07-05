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
          if(hRank<=2){
            ev.quality='good';ev.deduction=0;
            ev.comment='正解。'+hd+'（'+rankStr+'）の5BET/オールイン。自分の3BET後に4BETを受けた局面で、AA/KKは基本的にスタックオフ候補です。';
            ev.suggest='推奨: 5BET jam / コール';
            ev.strategyMix='Fold 0% / Call 35% / 5bet jam 65%';
          }else if(hRank<=6){
            const ded=hRank<=3?4:10;
            ev.quality=ded>=10?'bad':'ok';ev.deduction=ded;score-=ded;
            ev.comment='境界。'+hd+'（'+rankStr+'）の5BET。4BETレンジがQQ+/AK寄りの相手には慎重に。QQ/AK級は相手の4BET頻度が高い時だけ強く継続します。';
            ev.suggest='相手がタイトならコール/フォールド寄り。5BET jamは相手依存';
            ev.strategyMix='Fold 20-45% / Call 35-55% / 5bet jam 10-25%';
          }else{
            ev.quality='bad';ev.deduction=18;score-=18;
            ev.comment='【ミス】'+hd+'（'+rankStr+'）の5BET。3BETへの4BETはライブ$2/$5ではかなり強く、広い3BETレンジの感覚で押し返すと大きなEV損失になりやすいです。';
            ev.suggest='推奨: フォールド';
            ev.strategyMix='Fold 85-98% / Call 0-10% / 5bet jam 0-5%';
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
      }else{
        ev.quality='ok';ev.comment=hd+'（'+rankStr+'）の'+pn+' '+({fold:'フォールド',call:'コール',check:'チェック',raise:'レイズ',allin:'オールイン'}[d.action]||d.action)+'。';
      }
