'use strict';
// [Codex fix 2026-06-21] 通常ユーザーには開発用HUDを見せず、検証時だけURLパラメータで出す。
// [Codex fix 2026-06-28] codex_dev=0 を通常ユーザー表示として扱い、開発ボタンの誤表示を防ぐ。
const CODEX_DEV_PARAM=new URLSearchParams(location.search).get('codex_dev');
if(CODEX_DEV_PARAM==='1'||CODEX_DEV_PARAM==='true'){
  document.body.classList.add('codex-dev');
}
const RANKS=['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const SUITS=['s','h','d','c'];
const SUIT_SYM={s:'♠',h:'♥',d:'♦',c:'♣'};
const RANK_VAL={};RANKS.forEach((r,i)=>RANK_VAL[r]=i+2);
// [feature 2026-06-10] レンジ判定モード。'live'=$2/$5母集団(大ベットはブラフ不足→フォールド寄り)、'gto'=均衡前提(EV基準で正直に評価)。
let RANGE_MODE='live';
function getRangeMode(){return RANGE_MODE==='gto'?'gto':'live';}
function setRangeMode(m){RANGE_MODE=(m==='gto')?'gto':'live';return RANGE_MODE;}
// [feature 2026-06-10] プレッシャー割引のモード連動。GTOは均衡相手なので割引を弱める(1.0方向へ寄せる)が、ゼロにはしない(均衡でもベットレンジは偏る)。
const GTO_PRESSURE_RELAX=0.6; // GTO時は割引強度をLiveの約60%に緩める
function relaxPressureForMode(factor){
  if(getRangeMode()!=='gto'||!(factor<1))return factor;
  return 1-(1-factor)*GTO_PRESSURE_RELAX;
}
// [feature 2026-06-10] AI相手のブラフ頻度をモード連動。Liveは母集団の過小ブラフを再現(リバー/大ポットで顕著)、GTOは均衡のまま。
function aiBluffModeMult(isRiver){
  if(getRangeMode()!=='live')return 1.0;
  return isRiver?0.45:0.65;
}
const RANK_JP={A:'エース',K:'キング',Q:'クイーン',J:'ジャック',T:'テン',
  '9':'ナイン','8':'エイト','7':'セブン','6':'シックス','5':'ファイブ','4':'フォー','3':'スリー','2':'デュース'};
const HAND_NAMES=['ハイカード','ワンペア','ツーペア','スリーオブアカインド',
  'ストレート','フラッシュ','フルハウス','フォーオブアカインド','ストレートフラッシュ','ロイヤルフラッシュ'];
const AI_DELAY=800;

// [Codex fix 2026-05-26] 国内アミューズメントのチケット戦に向けたトーナメント局面プリセット。
// FISH_TANK_TOURNAMENT_PROFILES_MODULE
// FISH_TANK_LIVE_CASH_PROFILES_MODULE
// [Codex fix 2026-06-05] Keep many axes internally, but choose one human-readable main lesson for the result screen.
function primaryLessonModeLabel(ev,category){
  if(category&&category.indexOf('bubble')===0)return'トーナメント / バブル';
  if(category&&category.indexOf('final-table')===0)return'トーナメント / FT';
  if(category&&category.indexOf('heads-up')===0)return'トーナメント / HU';
  if(category&&category.indexOf('middle')===0)return'トーナメント / 中盤';
  if(category&&category.indexOf('early')===0)return'トーナメント / 序盤';
  if(ev&&ev.tournamentPhase)return'トーナメント / '+ev.tournamentPhase;
  if(ev&&(ev.liveCashSpotProfile||ev.liveCashSprProfile||ev.liveCashInitiativeProfile||ev.liveCashReraisedPotProfile||ev.liveCashMultiwayProfile||ev.liveCashRiverDecisionProfile))return'リング $2/$5';
  return'総合';
}
function primaryLessonCategoryWeight(category,ev){
  const c=category||'';
  let w=0;
  if(c==='bubble-icm'||c==='bubble-range')w+=12;
  else if(c==='final-table-icm'||c==='final-table-postflop')w+=11;
  else if(c==='river-onepair-discipline')w+=9;
  else if(c==='middle-stack-plan')w+=7;
  else if(c==='early-entry'||c==='preflop-entry')w+=6;
  else if(c==='heads-up-river')w+=6;
  else if(c==='threebet-pot-realization')w+=5;
  else if(c==='multiway-frequency')w+=4;
  else if(c==='ring-multiway-discipline')w+=8;
  else if(c==='ring-spr-stack-depth')w+=7;
  else if(c==='ring-initiative-position')w+=7;
  else if(c==='ring-reraised-pot')w+=8;
  else if(c==='ring-river-money')w+=10;
  if(ev&&ev.tournamentPhaseAxis&&/バブル|FT/.test(ev.tournamentPhaseAxis))w+=4;
  if(ev&&ev.street==='river'&&ev.action==='call')w+=3;
  if(ev&&ev.action==='fold'&&ev.quality==='good')w-=10;
  return w;
}
function primaryLessonForEval(ev){
  if(!ev)return null;
  const ded=ev.deduction||0;
  let lesson=null;
  function make(o){
    o=o||{};
    const sev=o.severity||((ev.quality==='bad'||ded>=12)?'bad':(ev.quality==='ok'||ded>0?'border':'good'));
    const sevBonus=sev==='bad'?22:sev==='border'?8:-10;
    const category=o.category||'general';
    const modeLabel=o.modeLabel||primaryLessonModeLabel(ev,category);
    return{
      category:category,
      title:o.title||'この判断の理由を整理する',
      street:ev.street||'',
      action:ev.action||'',
      axis:ev.evalAxis||o.axis||'',
      severity:sev,
      modeLabel:modeLabel,
      voice:o.voice||(modeLabel.indexOf('リング')>=0?'liveCash':modeLabel.indexOf('トーナメント')>=0?'tournament':'general'),
      confidence:o.confidence||'中',
      score:(o.priority||20)+Math.min(45,ded*2)+sevBonus+primaryLessonCategoryWeight(category,ev),
      summary:o.summary||'複数の要素が絡む場面なので、まず一番EVに影響する判断から直します。',
      reason:o.reason||'Raw EQだけでなく、ポジション、レンジ、ベットサイズ、相手のラインを合わせて見ます。',
      recommendation:o.recommendation||ev.suggest||'推奨ラインを確認して、同じ場面で再現できるようにします。'
    };
  }
  const rp=ev.liveCashReraisedPotProfile||null;
  if(ev.street==='preflop'&&ev.action==='fold'&&ev.quality==='good'&&!(ev.deduction>0)&&ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane==='openFold'){
    return null;
  }
  if(rp){
    lesson=make({
      category:'ring-reraised-pot',
      title:rp.lane==='fourBetResponse'||rp.lane==='fiveBetDecision'?'4BET後は継続レンジを一段締める':'3BETポットでは実現率と主導権を先に見る',
      priority:rp.severity==='bad'?48:34,
      severity:rp.severity,
      summary:'このハンドの主題は、3BET/4BET後に元のハンドの見た目だけで続けないことです。',
      reason:rp.policy+' '+rp.risk,
      recommendation:rp.suggest
    });
  }
  const mwp=ev.liveCashMultiwayProfile||null;
  if(!lesson&&mwp){
    lesson=make({
      category:'ring-multiway-discipline',
      title:mwp.lane==='multiwayCheckControl'||mwp.lane==='multiwayDisciplineFold'?'マルチウェイでは無理にポットを作らない':'マルチウェイでは薄いベットと受けを減らす',
      priority:mwp.severity==='bad'?46:31,
      severity:mwp.severity,
      summary:'このハンドの主題は、相手が複数いる時にブラフ・薄バリュー・ワンペア受けの頻度を下げることです。',
      reason:mwp.policy+' '+mwp.risk,
      recommendation:mwp.suggest
    });
  }
  const rvp=ev.liveCashRiverDecisionProfile||null;
  if(!lesson&&rvp){
    const titleMap={
      riverOnePairCatch:'リバーでワンペアを金額で降ろす',
      riverThinValueSize:'リバー薄バリューはサイズを選ぶ',
      riverBluffCandidate:'リバーのブラフは降りる相手にだけ作る',
      riverValueTarget:'リバーの強い手は取り切る',
      riverPotControlCheck:'リバーはチェックで勝ちを残す',
      riverGiveUp:'勝てないリバーは無理に打たない',
      riverMissedValue:'リバーの取り逃し候補を見直す',
      riverDisciplineFold:'リバーでワンペアを降ろせる力'
    };
    lesson=make({
      category:'ring-river-money',
      title:titleMap[rvp.lane]||'リバーの金額判断を整理する',
      priority:rvp.severity==='bad'?52:34,
      severity:rvp.severity,
      summary:'このハンドの主題は、リバーで払う・薄く取る・諦める判断を、手札の見た目ではなく金額と相手ラインで決めることです。',
      reason:rvp.policy+' '+rvp.risk,
      recommendation:rvp.suggest
    });
  }
  const p=ev.liveCashSpotProfile||null;
  if(!lesson&&p){
    if(p.lane==='riverOnePairCall')lesson=make({
      category:'river-onepair-discipline',title:'リバーでワンペアを受けすぎない',
      priority:54,severity:p.severity,
      summary:'このハンドの主題は、ショーダウン価値のあるワンペアをどこまでブラフキャッチに回すかです。',
      reason:p.policy+' '+p.risk,
      recommendation:p.suggest
    });
    else if(p.lane==='openLimp'||p.lane==='limpIsoCall'||p.lane==='sbColdCall')lesson=make({
      category:'preflop-entry',title:'プリフロップの入口を整理する',
      priority:50,severity:p.severity,
      summary:'このハンドの主題は、参加する前の形をレイズ・フォールド中心に整えることです。',
      reason:p.policy+' '+p.risk,
      recommendation:p.suggest
    });
    else if(p.lane==='openFold'&&p.severity!=='good')lesson=make({
      category:'preflop-entry',title:'プリフロップで降りすぎない',
      priority:42,severity:p.severity,
      summary:'このハンドの主題は、オープンできるポジションと手を過度に捨てないことです。',
      reason:p.policy+' '+p.risk,
      recommendation:p.suggest
    });
    else if(p.lane==='reraisedPot'||p.lane==='threeBetPotOop')lesson=make({
      category:'threebet-pot-realization',title:'3BETポットでは実現率を低く見る',
      priority:45,severity:p.severity,
      summary:'このハンドの主題は、3BET/4BET後にハンドの見た目だけで継続しないことです。',
      reason:p.policy+' '+p.risk,
      recommendation:p.suggest
    });
    else if(p.lane==='multiwayPressure')lesson=make({
      category:'multiway-frequency',title:'マルチウェイではベット頻度を絞る',
      priority:40,severity:p.severity,
      summary:'このハンドの主題は、複数人相手に薄いベットやブラフを増やしすぎないことです。',
      reason:p.policy+' '+p.risk,
      recommendation:p.suggest
    });
    else if(p.lane==='oopDonk'||p.lane==='limpIsoOopCheck')lesson=make({
      category:'initiative-oop',title:'主導権がないOOPはまずチェックで受ける',
      priority:38,severity:p.severity,
      summary:'このハンドの主題は、OOPで無理に主導権を取りに行かず、相手のレンジに話させることです。',
      reason:p.policy+' '+p.risk,
      recommendation:p.suggest
    });
    else if(p.lane==='riverThinValue')lesson=make({
      category:'thin-value-size',title:'薄いバリューはサイズを選ぶ',
      priority:34,severity:p.severity,
      summary:'このハンドの主題は、ワンペア級で取れる相手を残すサイズにすることです。',
      reason:p.policy+' '+p.risk,
      recommendation:p.suggest
    });
  }
  const sp=ev.liveCashSprProfile||null;
  if(!lesson&&sp){
    lesson=make({
      category:'ring-spr-stack-depth',
      title:sp.lane==='lowSprCommit'?'浅いSPRでは強い一枚役を降りすぎない':'SPRでワンペアの価値を変える',
      priority:sp.severity==='bad'?44:30,
      severity:sp.severity,
      summary:sp.lane==='deepSprPotControl'
        ?'このハンドの主題は、深いSPRでワンペアを無理に大きくしないことです。'
        :sp.lane==='lowSprCommit'
          ?'このハンドの主題は、残りスタックが浅い時に強い手の価値を正しく上げることです。'
          :'このハンドの主題は、同じワンペアでもSPRが深いほど慎重に扱うことです。',
      reason:sp.policy+' '+sp.risk,
      recommendation:sp.suggest
    });
  }
  const ip=ev.liveCashInitiativeProfile||null;
  if(!lesson&&ip){
    lesson=make({
      category:'ring-initiative-position',
      title:ip.lane==='oopNoInitiativeDonk'?'主導権がないOOPは無理に先打ちしない':'主導権とポジションを先に見る',
      priority:ip.severity==='bad'?42:28,
      severity:ip.severity,
      summary:ip.lane==='oopNoInitiativeCheck'
        ?'このハンドの主題は、OOPで無理にポットを作らず、まず相手に打たせることです。'
        :ip.lane==='pfrCbet'
          ?'このハンドの主題は、PFR側でもボードと人数でCB頻度を変えることです。'
          :'このハンドの主題は、誰が主導権を持ち、誰がポジションを持っているかを先に整理することです。',
      reason:ip.policy+' '+ip.risk,
      recommendation:ip.suggest
    });
  }
  if(!lesson&&ev.bubbleIcmRange&&ev.bubbleIcmRange.severity==='bad'){
    const br=ev.bubbleIcmRange;
    lesson=make({
      category:'bubble-range',title:'バブルでは受けるレンジを一段締める',
      priority:58,severity:'bad',
      summary:'このハンドの主題は、チップEVで足りそうに見えるコールを、通過率の損失まで含めて見直すことです。',
      reason:tournamentBubbleIcmRangeText(br),
      recommendation:'推奨: 押す側と受ける側を分け、カバーされる側の薄いcall/flatをかなり削ります。'
    });
  }
  if(!lesson&&ev.finalTablePostflopProfile){
    const fp=ev.finalTablePostflopProfile;
    lesson=make({
      category:'final-table-postflop',title:fp.severity==='bad'?'FTポストフロップで薄い受けを避ける':'FTではポット管理も正解にする',
      priority:fp.severity==='bad'?55:28,severity:fp.severity||'border',
      summary:fp.severity==='bad'
        ?'このハンドの主題は、FTで負けた時の順位落ちが大きい相手に、ワンペアや弱いSDVで付き合いすぎないことです。'
        :'このハンドのテーマは、FTでは強い手でも順位を守るためにチェックを使い分けることです。',
      reason:tournamentFinalTablePostflopProfileText(fp),
      recommendation:fp.suggest||'推奨: カバーされる側はポットを大きくしすぎず、カバー側は相手を選んで圧をかけます。'
    });
  }
  if(!lesson&&ev.finalTableLearningPoint){
    const lp=ev.finalTableLearningPoint;
    lesson=make({
      category:'final-table-icm',title:'FTではスタック関係を先に見る',
      priority:58,severity:lp.severity||'border',
      summary:'このハンドの主題は、手札の強さより先にFTの立場と衝突相手を確認することです。',
      reason:tournamentFinalTableLearningPointText(lp),
      recommendation:'推奨: カバーされる側の薄い受けを減らし、カバーしている時だけ圧を強めます。'
    });
  }
  if(!lesson&&ev.headsUpRiverProfile){
    const hp=ev.headsUpRiverProfile;
    lesson=make({
      category:'heads-up-river',title:hp.verdict==='thinCatch'?'HUリバーでもワンペアを自動コールしない':'HUリバーの薄いバリューをサイズで取る',
      priority:hp.severity==='bad'?50:32,severity:hp.severity||'border',
      summary:hp.verdict==='thinCatch'
        ?'このハンドの主題は、HUの広いレンジを理由にリバーの大きなベットを何でも受けないことです。'
        :'このハンドの主題は、HUの広いレンジ相手に、小〜中サイズで下のレンジから薄く取ることです。',
      reason:tournamentHeadsUpRiverProfileText(hp),
      recommendation:hp.suggest||'推奨: サイズが大きい時は相手依存、小〜中サイズなら薄いバリューとブラフキャッチを混ぜます。'
    });
  }
  if(!lesson&&ev.bubbleProfile){
    lesson=make({
      category:'bubble-icm',title:'バブル付近は受ける側を締める',
      priority:56,severity:ev.bubbleProfile.risk==='危険'?'bad':'border',
      summary:'このハンドの主題は、チップEVではなく通過率を落とすコールを避けることです。',
      reason:tournamentBubbleProfileText(ev.bubbleProfile),
      recommendation:'推奨: カバーされる側では薄いコールを減らし、押す側と受ける側を分けて判断します。'
    });
  }
  if(!lesson&&ev.middleProfile){
    const mp=ev.middleProfile;
    lesson=make({
      category:'middle-stack-plan',title:'中盤は有効BBで参加形を決める',
      priority:mp.severity==='bad'?44:34,severity:mp.severity==='bad'?'bad':(ev.quality==='bad'?'bad':'border'),
      summary:'このハンドの主題は、18〜25BB前後で安いコールに逃げず、open / reshove / fold / BB防衛を分けることです。',
      reason:tournamentMiddleProfileText(mp),
      recommendation:'推奨: 非BB flatを減らし、押し返せる手はreshove、押せない手はfoldへ寄せます。BBだけはポットオッズ込みで別に扱います。'
    });
  }
  if(!lesson&&(ev.earlyMultiwayProfile||ev.earlyDeepSprProfile)){
    const ep=ev.earlyMultiwayProfile||ev.earlyDeepSprProfile;
    const isDeep=!!ev.earlyDeepSprProfile;
    lesson=make({
      category:isDeep?'early-deep-spr':'early-multiway',
      title:isDeep?'序盤の深いSPRではワンペアを過信しない':'序盤マルチウェイでは薄いベットを減らす',
      priority:ep.severity==='bad'?43:26,severity:ep.severity||'border',
      summary:isDeep
        ?'このハンドの主題は、序盤の深いSPRでワンペアから大きなポットを作りすぎないことです。'
        :'このハンドの主題は、複数人相手ではブラフと薄いバリューの成功率が落ちることを先に見ることです。',
      reason:isDeep?tournamentEarlyDeepSprProfileText(ep):tournamentEarlyMultiwayProfileText(ep),
      recommendation:isDeep?'推奨: ワンペアはチェック/小さめ中心。大きく入れる時は強い2ペア以上や強ドロー寄りにします。':'推奨: チェック多め。打つなら小さめで、相手全員を降ろす前提のブラフを減らします。'
    });
  }
  if(!lesson&&ev.earlyProfile){
    const ep=ev.earlyProfile;
    lesson=make({
      category:'early-entry',title:'序盤は参加条件を丁寧に見る',
      priority:ep.severity==='bad'?42:24,severity:ep.severity||'border',
      summary:'このハンドの主題は、序盤の深いスタックで「見た目は遊べる手」を参加条件なしにコールしないことです。',
      reason:tournamentEarlyProfileText(ep),
      recommendation:'推奨: OOP、ドミネートされやすいオフスーツ、条件の悪い投機ハンドは締めます。参加するならポジションとインプライドがある時にします。'
    });
  }
  if(!lesson&&ev.headsUpProfile){
    const hp=ev.headsUpProfile;
    lesson=make({
      category:'heads-up-adjustment',title:'HUは降りすぎと受けすぎの幅を調整する',
      priority:42,severity:hp.severity||'border',
      summary:'このハンドの主題は、HU特有の広いレンジを前提に、攻める頻度と守る頻度を調整することです。',
      reason:tournamentHeadsUpProfileText(hp),
      recommendation:hp.suggest||'推奨: BTN/SBは広く攻め、BBは小さめベットに対して簡単に降りすぎないようにします。'
    });
  }
  if(!lesson&&ev.onePairProfile&&ev.street==='river'){
    const op=ev.onePairProfile;
    lesson=make({
      category:'river-onepair-discipline',title:'リバーでワンペアを受けすぎない',
      priority:48,severity:op.verdict==='bad'?'bad':op.verdict==='good'?'good':'border',
      summary:'このハンドの主題は、リバーのワンペアをショーダウン価値からブラフキャッチへ正しく格下げすることです。',
      reason:onePairPressureProfileText(op),
      recommendation:'推奨: 大きいベット、完成ボード、複数ストリート圧力が重なるほどフォールド寄りにします。'
    });
  }
  if(!lesson){
    const axis=ev.evalAxis||'';
    if(ev.street==='preflop')lesson=make({
      category:'preflop-entry',title:'プリフロップの入口を整理する',priority:(ev.quality==='bad'||(ev.deduction||0)>=8?36:16),
      summary:'このハンドの主題は、参加レンジとレイズ/コール/フォールドの形を整理することです。',
      reason:'プリフロップの小さなズレは、後のストリートで難しいワンペア判断に変わりやすいです。',
      recommendation:ev.suggest||'推奨: 参加するなら主導権とポジションを取りやすい形を優先します。'
    });
    else if(axis==='リバーのコール/フォールド')lesson=make({
      category:'river-decision',title:'リバー判断を相手のラインから決める',priority:38,
      summary:'このハンドの主題は、必要勝率だけでなく相手のラインの濃さを見ることです。',
      reason:'ライブ$2/$5ではリバーの大きなベットがバリューに寄りやすく、結果論のEQで正当化しない方が安全です。',
      recommendation:ev.suggest||'推奨: 相手がパッシブならフォールド寄り、明確にブラフ過多ならコールを残します。'
    });
    else if(axis==='チェック頻度と主導権')lesson=make({
      category:'initiative-oop',title:'主導権とポジションを先に見る',priority:30,
      summary:'このハンドの主題は、ハンド単体ではなく誰がレンジ優位を持つかでチェック/ベットを決めることです。',
      reason:'OOPやレンジ不利では、強そうに見えるワンペアでもまずチェックが自然な場面があります。',
      recommendation:ev.suggest||'推奨: 主導権がない時はチェック中心。打つ時は明確なバリューか強いドローに寄せます。'
    });
    else lesson=make({priority:24});
  }
  if(lesson.score>=74)lesson.confidence='高';
  else if(lesson.score>=48)lesson.confidence='中';
  else lesson.confidence='低';
  return lesson;
}
function primaryLessonForHand(hr,evals){
  if(!evals||!evals.length)return null;
  const candidates=evals.map(primaryLessonForEval).filter(Boolean);
  if(!candidates.length)return null;
  candidates.sort(function(a,b){return b.score-a.score;});
  const main=candidates[0];
  const supports=[];
  for(const ev of evals){
    const labels=[];
    if(ev.evalAxis)labels.push(ev.evalAxis);
    if(ev.liveCashSpotProfile)labels.push(ev.liveCashSpotProfile.label);
    if(ev.liveCashSprProfile)labels.push(ev.liveCashSprProfile.label);
    if(ev.onePairProfile)labels.push('ワンペア圧力');
    if(ev.tournamentPhaseAxis)labels.push(ev.tournamentPhaseAxis);
    if(ev.finalTableLearningPoint)labels.push('FT: '+ev.finalTableLearningPoint.title);
    if(ev.headsUpProfile)labels.push('HU');
    labels.forEach(function(x){
      if(x&&x!==main.axis&&x!==main.title&&supports.indexOf(x)<0)supports.push(x);
    });
  }
  main.supportingAxes=supports.slice(0,4);
  return main;
}
function primaryLessonText(lesson){
  if(!lesson)return'';
  let txt=(lesson.modeLabel?'['+lesson.modeLabel+'] ':'')+lesson.title+'。'+lesson.summary+' '+lesson.reason+' '+lesson.recommendation;
  if(lesson.supportingAxes&&lesson.supportingAxes.length)txt+=' 補足要因: '+lesson.supportingAxes.join(' / ')+'。';
  txt+=' 信頼度: '+lesson.confidence+'。';
  return txt;
}
function preflopPremiseAudit(hr){
  const issues=[];
  const warnings=[];
  const totalP=hr.players.filter(function(p){return p.active!==false;}).length||hr.players.length||6;
  const generatedPremise=!!(hr.scenario||hr.pfStory);
  const tctx=hr.tournamentContext&&hr.tournamentContext.enabled?hr.tournamentContext:null;
  const pref=hr.decisions.filter(function(d){return d.street==='preflop';});
  pref.forEach(function(d){
    if(d.action==='fold'||d.action==='check')return;
    const p=hr.players[d.playerIdx];
    if(!p||!p.holeCards||p.holeCards.length<2)return;
    const pos=d.position||posLabel(d.playerIdx,hr.dealerIndex,totalP);
    const stackBB=tctx?Math.max(1,Math.round((d.playerChipsBefore||((tctx.stackBB||25)*(hr.bigBlind||1)))/(hr.bigBlind||1))):null;
    const profile=tctx?tournamentRangeProfile(tctx,d,p.holeCards,stackBB,pos):liveCashRangeProfile(hr,d,p.holeCards,pos);
    if(!profile)return;
    const target=p.isHuman&&generatedPremise?'出題前提':(p.isHuman?'プレイヤー操作':'AI前提');
    const item={street:d.street,player:p.isHuman?'あなた':p.name,position:pos,action:d.action,amount:d.amount,target,profile,text:target+' '+(p.isHuman?'あなた':p.name)+'['+pos+'] '+rangeProfileTextForVisibility(profile,!p.isHuman)};
    // [Codex fix 2026-06-27] BBディフェンス練習のAIオープナーは、Heroに防衛判断を出すための前提なので通常AIリーク扱いしない。
    if(tctx&&tctx.focusId==='bb_defend'&&!p.isHuman&&profile.lane==='open'&&(d.action==='raise'||d.action==='allin'))return;
    if(generatedPremise&&p.isHuman&&d.action==='call'&&d.facingRaise&&pos!=='BB'){
      const before=hr.decisions.slice(0,hr.decisions.indexOf(d));
      const firstAgg=before.find(function(x){return x.street==='preflop'&&(x.action==='raise'||x.action==='allin');});
      const shape=simpleHandShape(p.holeCards[0],p.holeCards[1]);
      const earlyOpen=firstAgg&&['UTG','UTG+1','MP'].includes(firstAgg.position||'');
      if(earlyOpen&&shape.dominatedOffsuit){
        issues.unshift(Object.assign({},item,{text:item.text+' / 出題前提としては、早いポジションのオープンに非BBでドミネートされやすいオフスーツをコールしており不自然です。'}));
        return;
      }
    }
    if(profile.severity==='bad'){
      if(!p.isHuman||generatedPremise)issues.push(item);
    }else if(profile.severity==='border'){
      if(!p.isHuman||generatedPremise)warnings.push(item);
    }
  });
  if(tctx&&tctx.focusId==='bb_defend'){
    const human=hr.players.find(function(p){return p.isHuman;});
    const hIdx=hr.players.indexOf(human);
    const hPos=hIdx>=0?posLabel(hIdx,hr.dealerIndex,totalP):'';
    const humanBBDef=pref.some(function(d){return d.isHuman&&d.position==='BB'&&d.facingRaise;});
    if(hPos!=='BB'||!humanBBDef){
      issues.push({target:'出題前提',text:'BBディフェンス練習なのに、あなたがBBでオープンに直面する形になっていません。'});
    }
  }
  const score=Math.max(0,100-issues.length*18-warnings.length*8);
  return{score,grade:score>=90?'A':score>=75?'B':score>=55?'C':'D',issues,warnings,ok:issues.length===0};
}
// [Codex fix 2026-06-04] 出題生成そのものを監査し、低SPR/即オールイン/テーマ不一致の練習スポットを再生成できるようにする。
function trainingSpotQualityAudit(src,opts){
  opts=opts||{};
  if(!src||!src.players)return{score:0,grade:'D',ok:false,issues:[{text:'ゲーム状態を取得できません。'}],warnings:[]};
  const isEngine=!!src.activePlayers;
  const players=src.players||[];
  const bb=src.bb||src.bigBlind||1;
  const pot=src.pot||0;
  const currentBet=src.currentBet||0;
  const street=src.street||'';
  const community=src.community||[];
  const scenario=src._scenario||src.scenario||null;
  const pfStory=src._pfStory||src.pfStory||null;
  const tctx=src.tournamentContext&&src.tournamentContext.enabled?src.tournamentContext:null;
  const active=players.map(function(p,i){return{p,i};}).filter(function(x){return x.p&&x.p.active!==false;});
  const nonFolded=active.filter(function(x){return !x.p.folded;});
  const live=nonFolded.filter(function(x){return !x.p.allIn&&(x.p.chips||0)>0;});
  const humanIdx=players.findIndex(function(p){return p&&p.isHuman;});
  const human=humanIdx>=0?players[humanIdx]:null;
  const totalP=active.length||players.length||6;
  const issues=[],warnings=[];
  const mode=opts.mode||(tctx?'tournament':(scenario||pfStory?'scenario':'normal'));
  const actionIdx=isEngine?src.actionIdx:null;
  const spr=human&&pot>0?Math.round((human.chips||0)/pot*10)/10:null;
  const minScenarioSpr=tctx?1.6:2.0;
  if(active.length<2)issues.push({text:'アクティブプレイヤーが2人未満です。'});
  if(!human)issues.push({text:'Heroが見つかりません。'});
  else{
    if(human.folded)issues.push({text:'Heroがフォールド済みで、練習対象になっていません。'});
    if(!human.holeCards||human.holeCards.length<2)issues.push({text:'Heroのホールカードがありません。'});
    if((human.chips||0)<=0)issues.push({text:'Heroが既にオールイン/0チップで、意思決定の余地がありません。'});
    else if((scenario||pfStory)&&spr!=null&&spr<minScenarioSpr)issues.push({text:'SPR '+spr+' は低すぎます。フロップ練習としてベット/コール/フォールドの余地が不足します。'});
    else if((scenario||pfStory)&&spr!=null&&spr<minScenarioSpr+0.8)warnings.push({text:'SPR '+spr+' は浅めです。ワンペアが自動コミット気味になりやすい前提です。'});
  }
  if(scenario||pfStory){
    if(street!=='flop'&&street!=='turn'&&street!=='river')warnings.push({text:'ポストフロップ練習なのに現在ストリートが '+street+' です。'});
    if(community.length<3)issues.push({text:'フロップカードが3枚ありません。'});
    if(nonFolded.length<2)issues.push({text:'フロップ参加者が2人未満です。'});
    if(live.length<2)issues.push({text:'相手を含めたライブプレイヤーが2人未満です。全員オールインに近く、練習になりません。'});
    if(isEngine&&actionIdx<0)issues.push({text:'次に行動するプレイヤーが存在しません。自動ランアウト状態です。'});
    if(currentBet>0)warnings.push({text:'生成直後に未処理ベットが残っています。'});
    if(pfStory&&pfStory.participants){
      if(humanIdx>=0&&!pfStory.participants.includes(humanIdx))issues.push({text:'プリフロップ前提にHeroが参加していません。'});
      pfStory.participants.forEach(function(i){
        const p=players[i];
        if(!p)return;
        if(p.folded)issues.push({text:(p.isHuman?'Hero':p.name)+' が参加者扱いなのにフォールド済みです。'});
        if(!p.holeCards||p.holeCards.length<2)issues.push({text:(p.isHuman?'Hero':p.name)+' が参加者扱いなのにカードがありません。'});
      });
    }
  }
  if(tctx&&tctx.focusId==='bb_defend'){
    const hPos=humanIdx>=0?posLabel(humanIdx,src.dealerIndex,totalP):'';
    if(hPos!=='BB')issues.push({text:'BBディフェンス練習なのにHero位置がBBではありません（現在 '+hPos+'）。'});
    if(human&&(human.chips||0)<bb*8)issues.push({text:'BBディフェンス練習としてHeroスタックが浅すぎます。push/foldになりやすい前提です。'});
  }
  if(tctx&&tctx.focusId==='bbante_steal'){
    const hPos=humanIdx>=0?posLabel(humanIdx,src.dealerIndex,totalP):'';
    if(!['CO','BTN','SB'].includes(hPos))warnings.push({text:'BBアンティスチール練習としてHero位置がややテーマ外です（現在 '+hPos+'）。'});
  }
  const cardCode=function(c){return c&&c.rank&&c.suit?c.rank+c.suit:String(c||'');};
  const used=[];
  community.forEach(function(c){if(c)used.push(cardCode(c));});
  players.forEach(function(p){(p.holeCards||[]).forEach(function(c){if(c)used.push(cardCode(c));});});
  const dup=used.filter(function(x,i){return used.indexOf(x)!==i;});
  if(dup.length)issues.push({text:'カード重複があります: '+[...new Set(dup)].join(', ')});
  const score=Math.max(0,100-issues.length*22-warnings.length*8);
  return{mode,score,grade:score>=90?'A':score>=75?'B':score>=55?'C':'D',ok:issues.length===0,issues,warnings,spr,livePlayers:live.length,nonFolded:nonFolded.length};
}
function trainingSpotQualityText(q){
  if(!q)return'';
  const bits=['品質 '+q.grade+'('+q.score+')'];
  if(q.spr!=null)bits.push('SPR '+q.spr);
  if(q.issues&&q.issues.length)bits.push('要修正: '+q.issues.map(function(x){return x.text;}).join(' / '));
  else if(q.warnings&&q.warnings.length)bits.push('注意: '+q.warnings.map(function(x){return x.text;}).join(' / '));
  else bits.push('出題前提は成立');
  return bits.join(' / ');
}
var _actualHandAuditRunning=false;
// [Codex fix 2026-06-04] 評価が相手の実ホールカードではなく公開情報/レンジに基づくかを機械的に監査する。
function actualHandVisibility(hr){
  const reachedShowdown=!!(hr&&hr.community&&hr.community.length>=5&&hr.winners&&hr.winners.length>0&&!hr.winners.some(function(w){return w.byFold;}));
  const hidden=[];
  const publicShown=[];
  if(!hr||!hr.players)return{reachedShowdown:false,hiddenCardCount:0,publicCardCount:0,hiddenCodes:[],publicCodes:[]};
  hr.players.forEach(function(p){
    if(!p||p.isHuman||!p.holeCards||p.holeCards.length<2)return;
    const codes=p.holeCards.map(function(c){return c.rank+c.suit;});
    if(reachedShowdown&&!p.folded)publicShown.push.apply(publicShown,codes);
    else hidden.push.apply(hidden,codes);
  });
  return{reachedShowdown,hiddenCardCount:hidden.length,publicCardCount:publicShown.length,hiddenCodes:hidden,publicCodes:publicShown};
}
function cloneCardForAudit(c){return c&&c.rank&&c.suit?new Card(c.rank,c.suit):c;}
function cloneHandForActualAudit(hr){
  return{
    handNum:hr.handNum,
    winners:hr.winners||[],
    community:(hr.community||[]).map(cloneCardForAudit),
    players:(hr.players||[]).map(function(p){
      return Object.assign({},p,{
        holeCards:(p.holeCards||[]).map(cloneCardForAudit),
        handResult:p.handResult||null
      });
    }),
    decisions:(hr.decisions||[]).map(function(d){return Object.assign({},d);}),
    pot:hr.pot,
    street:hr.street,
    dealerIndex:hr.dealerIndex,
    bigBlind:hr.bigBlind,
    numActive:hr.numActive,
    scenario:hr.scenario||null,
    pfStory:hr.pfStory||null,
    scenarioQuality:hr.scenarioQuality||null,
    tournamentContext:hr.tournamentContext?Object.assign({},hr.tournamentContext):null
  };
}
function replaceHiddenOpponentCardsForAudit(hr,variant){
  const out=cloneHandForActualAudit(hr);
  const used=new Set();
  (out.community||[]).forEach(function(c){used.add(c.rank+c.suit);});
  out.players.forEach(function(p){if(p.isHuman)(p.holeCards||[]).forEach(function(c){used.add(c.rank+c.suit);});});
  const ranks=variant==='premium'?['A','K','Q','J','T','9','8','7','6','5','4','3','2']:['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const suits=variant==='premium'?['s','h','d','c']:['c','d','h','s'];
  const pool=[];
  ranks.forEach(function(r){suits.forEach(function(s){const code=r+s;if(!used.has(code))pool.push(new Card(r,s));});});
  let ptr=0;
  const vis=actualHandVisibility(hr);
  out.players.forEach(function(p,idx){
    if(p.isHuman||!p.holeCards||p.holeCards.length<2)return;
    const original=(hr.players[idx].holeCards||[]).map(function(c){return c.rank+c.suit;});
    const isHidden=original.some(function(code){return vis.hiddenCodes.includes(code);});
    if(!isHidden)return;
    p.holeCards=[pool[ptr++],pool[ptr++]];
  });
  return out;
}
function withSeededRandomForAudit(seed,fn){
  const oldRandom=Math.random;
  let s=seed||1357911;
  Math.random=function(){s=(s*48271)%2147483647;return (s-1)/2147483646;};
  try{return fn();}finally{Math.random=oldRandom;}
}
function actualHandEvalSignature(an){
  if(!an||!an.evals)return null;
  function stableCommentText(txt){
    return String(txt||'').replace(/<[^>]+>/g,'').replace(/\d+(?:\.\d+)?%?/g,'#').replace(/\s+/g,' ').trim();
  }
  return{
    evals:an.evals.map(function(e){
      return{
        street:e.street,
        action:e.action,
        amount:e.amount,
        quality:e.quality,
        deduction:e.deduction||0,
        rangeAdv:e.rangeAdv||'',
        nutAdv:e.nutAdv||'',
        suggest:e.suggest||'',
        comment:stableCommentText(e.comment)
      };
    })
  };
}
function actualHandTextLeakCount(hr,an){
  const vis=actualHandVisibility(hr);
  if(!vis.hiddenCodes.length||!an)return 0;
  const hay=[
    an.gradeLabel||'',
    an.primaryLesson?primaryLessonText(an.primaryLesson):'',
    an.premiseAudit?[].concat(an.premiseAudit.issues||[],an.premiseAudit.warnings||[]).map(function(x){return x&&x.text||'';}).join(' '):'',
    (an.evals||[]).map(function(e){
      return [e.comment||'',e.suggest||'',e.strategyMix||'',e.axisWeightNote||'',e.phaseWeightNote||''].join(' ');
    }).join(' ')
  ].join(' ');
  // [Codex fix 2026-06-25] K5s/97s のようなハンドタイプ表記を、実カード 5s/7s の漏れと誤検知しない。
  const cardTokenBoundary='A23456789TJQKcdhs';
  return vis.hiddenCodes.filter(function(code){
    const re=new RegExp('(^|[^'+cardTokenBoundary+'])'+code.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'($|[^'+cardTokenBoundary+'])');
    return re.test(hay);
  }).length;
}
function actualHandLeakAuditText(audit){
  if(!audit)return'';
  const base=audit.status+' / '+audit.policy;
  if(audit.showdownPublic)return base+' / ショーダウン公開カードあり';
  return base+' / 非公開相手カード '+audit.hiddenCardCount+'枚 / 評価不変='+(audit.evalInvariant?'OK':'NG')+' / テキスト漏れ='+(audit.textLeak?'NG':'OK');
}
function actualHandLeakAudit(hr,an,opts){
  opts=opts||{};
  const vis=actualHandVisibility(hr);
  const textLeakCount=actualHandTextLeakCount(hr,an);
  let evalInvariant=true,variantCount=0,diffSummary='';
  if(vis.hiddenCardCount>0&&!opts.skipInvariance){
    const oldFlag=_actualHandAuditRunning;
    _actualHandAuditRunning=true;
    try{
      const baseSig=withSeededRandomForAudit(86421,function(){
        return actualHandEvalSignature(analyzeHand(cloneHandForActualAudit(hr)));
      });
      ['low','premium'].forEach(function(v){
        const sig=withSeededRandomForAudit(86421,function(){
          return actualHandEvalSignature(analyzeHand(replaceHiddenOpponentCardsForAudit(hr,v)));
        });
        variantCount++;
        if(JSON.stringify(sig)!==JSON.stringify(baseSig)){
          evalInvariant=false;
          if(!diffSummary)diffSummary='hidden opponent cards changed evaluation signature on '+v+' variant';
        }
      });
    }finally{
      _actualHandAuditRunning=oldFlag;
    }
  }
  const ok=textLeakCount===0&&evalInvariant;
  return{
    status:ok?'PASS':'FAIL',
    policy:'相手実ハンド不使用・レンジ評価',
    showdownPublic:vis.reachedShowdown,
    hiddenCardCount:vis.hiddenCardCount,
    publicCardCount:vis.publicCardCount,
    textLeak:textLeakCount>0,
    textLeakCount,
    evalInvariant,
    variantCount,
    diffSummary,
    note:ok?'相手の非公開ホールカードを差し替えてもユーザー評価は変わりません。':'相手実ハンド由来の混入可能性があります。'
  };
}
// [Codex fix 2026-05-27] テーマ別トレーニングで人間の席を寄せ、狙ったプリフロップ判断を出やすくする。
function tournamentFocusTargetPositions(focusId){
  const map={
    bbante_steal:['CO','BTN','SB'],
    reshove20:['CO','BTN','SB'],
    openjam14:['CO','BTN','SB'],
    bubble_call:['BTN','CO','BB'],
    bb_defend:['BB'],
    ft_payjump:['CO','BTN','SB','BB'],
    hu_aggression:['BTN','BB']
  };
  return map[focusId]||null;
}
function dealerForHumanPosition(numPlayers,targetPos,humanIdx){
  for(let d=0;d<numPlayers;d++){
    if(posLabel(humanIdx,d,numPlayers)===targetPos)return d;
  }
  return null;
}
function tournamentFocusHandAllowed(c1,c2,focusId,pos,stackBB){
  const ht=handType(c1,c2);
  const frac=HAND_COMBO_FRAC[ht]||0.99;
  const r1=RANK_VAL[c1.rank]||0,r2=RANK_VAL[c2.rank]||0;
  const hi=Math.max(r1,r2),lo=Math.min(r1,r2);
  const suited=c1.suit===c2.suit,pair=r1===r2,gap=hi-lo;
  const wheelAxs=suited&&hi===14&&lo<=5;
  const suitedBroadway=suited&&hi>=12&&lo>=10;
  const suitedConnector=suited&&gap<=2&&hi>=7;
  const broadway=hi>=12&&lo>=10;
  if(focusId==='reshove20'){
    if(pair&&lo>=5&&lo<=11)return true;
    if(wheelAxs||suitedBroadway||suitedConnector)return true;
    return suited&&frac<=0.30;
  }
  if(focusId==='openjam14'){
    if(['CO','BTN','SB'].includes(pos)&&(wheelAxs||(pair&&lo<=11)||suitedConnector||broadway))return frac<=0.42;
    return frac<=0.24;
  }
  if(focusId==='bubble_call'){
    if(!suited&&broadway&&frac>=0.12&&frac<=0.34)return true;
    if(!suited&&hi===14&&lo>=7&&lo<=11)return true;
    if(pair&&lo<=8)return true;
    return suited&&frac>=0.22&&frac<=0.48;
  }
  if(focusId==='bb_defend'){
    if(frac<0.10)return false;
    if(suitedConnector||suitedBroadway||wheelAxs)return true;
    if(pair&&lo<=9)return true;
    if(!suited&&gap<=3&&hi>=9&&frac<=0.55)return true;
    return frac>=0.36&&frac<=0.62;
  }
  if(focusId==='ft_payjump'){
    if(pair&&lo>=4&&lo<=12)return true;
    if(wheelAxs||suitedBroadway||suitedConnector)return true;
    if(!suited&&hi===14&&lo>=7&&lo<=12)return true;
    return frac>=0.10&&frac<=0.48;
  }
  if(focusId==='hu_aggression'){
    if(pair||suited||hi>=11||gap<=4)return frac<=0.72;
    return frac>=0.35&&frac<=0.75;
  }
  if(focusId==='bbante_steal'){
    if(['CO','BTN','SB'].includes(pos))return frac<=0.42||wheelAxs||suitedConnector;
    return frac<=0.28;
  }
  return false;
}
function drawTournamentFocusHand(deckCards,focusId,pos,stackBB){
  if(!focusId||focusId==='general')return null;
  for(let pass=0;pass<2;pass++){
    for(let i=0;i<deckCards.length;i++){
      for(let j=i+1;j<deckCards.length;j++){
        if(tournamentFocusHandAllowed(deckCards[i],deckCards[j],focusId,pos,stackBB)){
          return[deckCards.splice(j,1)[0],deckCards.splice(i,1)[0]];
        }
      }
    }
    deckCards.sort(()=>Math.random()-0.5);
  }
  return null;
}
// 9シートの位置 (テーブル楕円に沿った均等配置, x:9-91%で画面外れを防止)
const ALL_SEAT_POS=[
  {x:50,y:89},  // 0: 自分 (下中央)
  {x:24,y:80},  // 1: 下左
  {x:9,y:55},   // 2: 左中 (5→9に変更: モバイル画面外れ防止)
  {x:17,y:23},  // 3: 上左
  {x:38,y:9},   // 4: 上中左
  {x:62,y:9},   // 5: 上中右
  {x:83,y:23},  // 6: 上右
  {x:91,y:55},  // 7: 右中 (95→91に変更)
  {x:76,y:80}   // 8: 下右
];
const SEAT_SELECTION={
  2:[0,4],3:[0,3,6],4:[0,2,4,7],5:[0,1,3,5,7],
  6:[0,1,3,4,6,8],7:[0,1,2,4,5,6,8],8:[0,1,2,3,5,6,7,8],
  9:[0,1,2,3,4,5,6,7,8]
};

// ---- AI PROFILES (11 characters) ----
const AI_PROFILES={
  yu:{displayName:'yu',color:'#c25008',style:'ルーズ｜フォールドできない',
    desc:'肝心な場面でフォールドできない。若干ルーズ。ペアがあれば大抵コール。',
    openWidthMult:1.35,bbDefenseWidth:1.1,foldToBetBase:0.42,bluffFreq:0.14,
    betSizeMult:1.0,donkFreq:0.04,posAware:0.65,noise:0.13,cantFoldMadeHand:true},
  bitts:{displayName:'bitts',color:'#1e3a8a',style:'タイトパッシブ｜ブラフなし',
    desc:'非常にタイト。プリフロップはプレミアム中心。ブラフはほぼせず、ベットしたら強い。',
    openWidthMult:0.65,bbDefenseWidth:0.75,foldToBetBase:0.72,bluffFreq:0.04,
    betSizeMult:0.75,donkFreq:0.0,posAware:0.82,noise:0.06,cantFoldMadeHand:false},
  bun:{displayName:'bun',color:'#b91c1c',style:'ルーズアグレッシブ｜フィッシュ',
    desc:'非常にルーズ。何でもプレーし、ドンクベット多用。ポジション意識低め。',
    openWidthMult:2.00,bbDefenseWidth:1.35,foldToBetBase:0.32,bluffFreq:0.38,
    betSizeMult:1.25,donkFreq:0.22,posAware:0.28,noise:0.28,cantFoldMadeHand:false},
  kan:{displayName:'kan',color:'#6d28d9',style:'読めない｜アンプレディクタブル',
    desc:'何を考えているか読めない。ランダム性が高く、強い手でもフォールドすることも。',
    openWidthMult:1.30,bbDefenseWidth:1.0,foldToBetBase:0.52,bluffFreq:0.22,
    betSizeMult:1.05,donkFreq:0.10,posAware:0.55,noise:0.55,cantFoldMadeHand:false},
  take:{displayName:'take',color:'#15803d',style:'均衡｜GTO',
    desc:'バランスの取れたGTOプレイ。ブラフとバリューのバランスが良く、崩れにくい。',
    openWidthMult:1.00,bbDefenseWidth:1.0,foldToBetBase:0.60,bluffFreq:0.20,
    betSizeMult:1.0,donkFreq:0.04,posAware:0.90,noise:0.08,cantFoldMadeHand:false},
  jiro:{displayName:'jiro',color:'#92400e',style:'エクスプロイト｜適応型',
    desc:'相手のミスを突くエクスプロイタープレイヤー。パッシブな相手にはアグレッシブに。',
    openWidthMult:1.05,bbDefenseWidth:1.0,foldToBetBase:0.58,bluffFreq:0.22,
    betSizeMult:1.05,donkFreq:0.03,posAware:0.92,noise:0.08,cantFoldMadeHand:false,exploitative:true},
  nt:{displayName:'nt',color:'#dc2626',style:'ブラフ過多｜マルチウェイでも押す',
    desc:'ブラフ頻度が異常に高い。複数の相手がいてもピュアブラフで押してくることがある。',
    openWidthMult:1.70,bbDefenseWidth:1.1,foldToBetBase:0.48,bluffFreq:0.58,
    betSizeMult:1.2,donkFreq:0.12,posAware:0.42,noise:0.20,cantFoldMadeHand:false,ignoreMultiway:true},
  m:{displayName:'m',color:'#1d4ed8',style:'均衡｜若干強気',
    desc:'GTOベースだが若干アグレッシブ寄り。バリューベットのサイジングが大きめ。',
    openWidthMult:0.95,bbDefenseWidth:1.0,foldToBetBase:0.57,bluffFreq:0.18,
    betSizeMult:1.18,donkFreq:0.02,posAware:0.88,noise:0.07,cantFoldMadeHand:false},
  dai:{displayName:'dai',color:'#374151',style:'ニット｜超タイト',
    desc:'極端にタイト。AA/KK/QQ/AKs程度しか遊ばない。ベットしたら確実にナッツ級。',
    openWidthMult:0.45,bbDefenseWidth:0.60,foldToBetBase:0.82,bluffFreq:0.02,
    betSizeMult:0.85,donkFreq:0.0,posAware:0.92,noise:0.04,cantFoldMadeHand:false},
  yohe:{displayName:'yohe',color:'#065f46',style:'タイト気味｜コール多め',
    desc:'若干タイトで堅実。ブラフよりコールを選びがちなパッシブ寄り。強いハンドには固執する。',
    openWidthMult:0.75,bbDefenseWidth:0.88,foldToBetBase:0.52,bluffFreq:0.08,
    betSizeMult:0.88,donkFreq:0.02,posAware:0.75,noise:0.10,cantFoldMadeHand:false,callBias:true},
  world:{displayName:'world',color:'#78350f',style:'日本代表プロ｜理論精通',
    desc:'日本を代表するプロプレイヤー。GTO・エクスプロイト双方に精通。弱点が少なく、状況判断が鋭い。',
    openWidthMult:1.05,bbDefenseWidth:1.05,foldToBetBase:0.61,bluffFreq:0.21,
    betSizeMult:1.08,donkFreq:0.03,posAware:0.97,noise:0.04,cantFoldMadeHand:false,exploitative:true}
};
const PROFILE_KEYS=Object.keys(AI_PROFILES);

// ---- CARD & DECK ----
class Card{
  constructor(r,s){this.rank=r;this.suit=s;this.value=RANK_VAL[r];}
  get sym(){return SUIT_SYM[this.suit];}
  get isRed(){return this.suit==='h'||this.suit==='d';}
  toString(){return this.rank+this.suit;}
}
class Deck{
  constructor(){this.reset();}
  reset(){this.cards=[];for(const s of SUITS)for(const r of RANKS)this.cards.push(new Card(r,s));this.shuffle();}
  shuffle(){for(let i=this.cards.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[this.cards[i],this.cards[j]]=[this.cards[j],this.cards[i]];}}
  deal(){return this.cards.pop();}
}

// ---- HAND EVALUATOR ----
const HandEval={
  evaluate(cards){const combos=this._combos(cards,5);let best=null;for(const c of combos){const r=this._eval5(c);if(!best||r.score>best.score)best=r;}return best;},
  _combos(arr,k){if(k===0)return[[]];if(arr.length<k)return[];const[h,...t]=arr;return[...this._combos(t,k-1).map(c=>[h,...c]),...this._combos(t,k)];},
  _eval5(cards){
    const s=[...cards].sort((a,b)=>b.value-a.value);
    const v=s.map(c=>c.value),su=s.map(c=>c.suit);
    const fl=su.every(x=>x===su[0]),st=this._st(v);
    const fr={};v.forEach(x=>fr[x]=(fr[x]||0)+1);
    const co=Object.entries(fr).map(([x,c])=>({v:+x,c})).sort((a,b)=>b.c-a.c||b.v-a.v);
    let cat,score;
    if(fl&&st){cat=v[0]===14&&v[4]===10?9:8;score=cat*1e13+st.h*1e9;}
    else if(co[0].c===4){cat=7;score=7e13+co[0].v*1e9+co[1].v;}
    else if(co[0].c===3&&co[1].c===2){cat=6;score=6e13+co[0].v*1e9+co[1].v*1e5;}
    else if(fl){cat=5;score=5e13;v.forEach((x,i)=>score+=x*Math.pow(100,4-i));}
    else if(st){cat=4;score=4e13+st.h*1e9;}
    else if(co[0].c===3){cat=3;score=3e13+co[0].v*1e9;const k=co.slice(1).map(x=>x.v);score+=k[0]*1e5+k[1]*10;}
    else if(co[0].c===2&&co[1].c===2){cat=2;const hp=Math.max(co[0].v,co[1].v),lp=Math.min(co[0].v,co[1].v);score=2e13+hp*1e9+lp*1e5+co[2].v;}
    else if(co[0].c===2){cat=1;score=1e13+co[0].v*1e9;const k=co.slice(1).map(x=>x.v);score+=k[0]*1e5+k[1]*1e3+k[2];}
    else{cat=0;score=0;v.forEach((x,i)=>score+=x*Math.pow(100,4-i));}
    return{score,cat,name:HAND_NAMES[cat],bestFive:s,co};
  },
  _st(v){
    const u=[...new Set(v)];
    if(u[0]===14&&u.includes(2)&&u.includes(3)&&u.includes(4)&&u.includes(5))return{h:5};
    for(let i=0;i<=u.length-5;i++){if(u[i]-u[i+4]===4&&new Set(u.slice(i,i+5)).size===5)return{h:u[i]};}
    return false;
  }
};

// ---- EQUITY (Monte Carlo) ----
function estimateEquity(hc,board,nOpp,iter){
  // [fix 2026-06-10] タイは0.5で計上。完成リバー×単独相手は全相手2枚を厳密列挙し決定論的に算出。
  const deck=new Deck();
  const known=new Set([...hc,...board].map(c=>c.toString()));
  const rem=deck.cards.filter(c=>!known.has(c.toString()));
  if(board.length>=5&&nOpp===1){
    const my=HandEval.evaluate([...hc,...board]).score;
    let score=0,total=0;
    for(let i=0;i<rem.length;i++)for(let j=i+1;j<rem.length;j++){
      const os=HandEval.evaluate([rem[i],rem[j],...board]).score;
      score+=my>os?1:(my===os?0.5:0);total++;
    }
    return total?score/total:0;
  }
  iter=iter||300;let score=0;
  for(let i=0;i<iter;i++){
    for(let k=rem.length-1;k>0;k--){const r=(Math.random()*(k+1))|0;const t=rem[k];rem[k]=rem[r];rem[r]=t;}
    const d=rem;let p=0;
    const b=[...board];while(b.length<5)b.push(d[p++]);
    const my=HandEval.evaluate([...hc,...b]).score;
    let lose=false,tie=false;
    for(let o=0;o<nOpp;o++){
      const c1=d[p++],c2=d[p++];
      if(!c1||!c2)continue;
      const os=HandEval.evaluate([c1,c2,...b]).score;
      if(os>my){lose=true;break;}
      if(os===my)tie=true;
    }
    score+=lose?0:(tie?0.5:1);
  }
  return score/iter;
}

// FISH_TANK_PREFLOP_CORE_MODULE
// [Codex fix 2026-05-28] トーナメント用のカバー関係。バブル/サテライトではchipEV以上に重要。
function stackCoverInfo(player,players,bb){
  const opps=players.filter(p=>p&&p.active&&!p.folded&&p!==player);
  const stack=player?player.chips:0;
  if(!opps.length)return{coverLabel:'HU/対象なし',coverState:'neutral',coverDeltaBB:0,coveredByCount:0,coverCount:0};
  const bigger=opps.filter(p=>p.chips>stack);
  const smaller=opps.filter(p=>p.chips<stack);
  const maxOpp=Math.max(...opps.map(p=>p.chips));
  const minOpp=Math.min(...opps.map(p=>p.chips));
  const denom=bb||1;
  let coverLabel='同程度';
  let coverState='neutral';
  let delta=0;
  if(bigger.length&&!smaller.length){
    coverState='covered';
    delta=Math.round((maxOpp-stack)/denom);
    coverLabel='カバーされている';
  }else if(smaller.length&&!bigger.length){
    coverState='covering';
    delta=Math.round((stack-minOpp)/denom);
    coverLabel='カバーしている';
  }else if(maxOpp>stack){
    coverState='mixed_covered';
    delta=Math.round((maxOpp-stack)/denom);
    coverLabel='上位スタックあり';
  }else{
    coverState='mixed_covering';
    delta=Math.round((stack-minOpp)/denom);
    coverLabel='下位スタックあり';
  }
  return{coverLabel,coverState,coverDeltaBB:delta,coveredByCount:bigger.length,coverCount:smaller.length};
}
function coverPressureText(coverState){
  if(coverState==='covered'||coverState==='mixed_covered')return'高';
  if(coverState==='covering'||coverState==='mixed_covering')return'攻め可';
  return'中';
}
// [Codex fix 2026-06-03] バブル評価用に、最短ショート・スタック順位・次BBまでの距離を記録する。
function tournamentStackPressureInfo(player,players,bb,dealerIndex){
  const active=players.map((p,i)=>({p,i})).filter(x=>x.p&&x.p.active&&!x.p.folded);
  const denom=bb||1;
  if(!player||!active.length)return{stackRank:null,shortestStackBB:null,shortestOppStackBB:null,bbInHands:null,nextBBPressure:'',shorterStackCount:0};
  const stack=player.chips||0;
  const sorted=[...active].sort((a,b)=>(b.p.chips||0)-(a.p.chips||0));
  const stackRank=sorted.findIndex(x=>x.p===player)+1;
  const shortest=Math.min(...active.map(x=>x.p.chips||0));
  const opps=active.filter(x=>x.p!==player);
  const shortestOpp=opps.length?Math.min(...opps.map(x=>x.p.chips||0)):null;
  const shorterStackCount=opps.filter(x=>(x.p.chips||0)<stack).length;
  const activeIdxs=active.map(x=>x.i);
  const n=activeIdxs.length;
  let bbInHands=null;
  if(n>=2&&dealerIndex!=null){
    const dealerPos=activeIdxs.indexOf(dealerIndex);
    const playerPos=activeIdxs.indexOf(players.indexOf(player));
    if(dealerPos>=0&&playerPos>=0){
      const rel=(playerPos-dealerPos+n)%n;
      const bbRel=n===2?1:2;
      bbInHands=(rel-bbRel+n)%n;
    }
  }
  let nextBBPressure='';
  if(bbInHands===0)nextBBPressure='現在BB';
  else if(bbInHands===1)nextBBPressure='次ハンドBB';
  else if(bbInHands===2)nextBBPressure='2ハンド以内BB';
  return{
    stackRank,
    shortestStackBB:Math.round(shortest/denom),
    shortestOppStackBB:shortestOpp==null?null:Math.round(shortestOpp/denom),
    bbInHands,
    nextBBPressure,
    shorterStackCount
  };
}
function posLabel(si,di,n){
  const rel=((si-di)%n+n)%n;
  if(n===2)return rel===0?'SB':'BB';
  if(rel===0)return'BTN';if(rel===1)return'SB';if(rel===2)return'BB';
  const pos=rel-3;
  // 人数ごとのポジション名テーブル（BTN/SB/BB除く）
  const tbl={
    1:['UTG'],
    2:['UTG','CO'],
    3:['UTG','MP','CO'],
    4:['UTG','UTG+1','HJ','CO'],
    5:['UTG','UTG+1','MP','HJ','CO'],
    6:['UTG','UTG+1','MP','LJ','HJ','CO']
  };
  const tot=n-3;
  const arr=tbl[tot]||tbl[6];
  return arr[Math.min(pos,arr.length-1)]||'MP';
}

function aiRankInfo(holeCards){
  const r1=RANK_VAL[holeCards[0].rank]||0,r2=RANK_VAL[holeCards[1].rank]||0;
  return{hi:Math.max(r1,r2),lo:Math.min(r1,r2),suited:holeCards[0].suit===holeCards[1].suit,pair:r1===r2};
}
function aiColdCallCap(pos,suited,multi){
  const base={UTG:0.10,'UTG+1':0.12,MP:0.15,LJ:0.17,HJ:0.19,CO:0.24,BTN:0.30,SB:0.14,BB:0.42}[pos]||0.18;
  return Math.max(0.05,base+(suited?0.045:0)-(multi?0.035:0));
}
function aiSizedAction(target,chips,currentBet){
  const rt=Math.round(Math.max(0,Math.min(target,chips+currentBet)));
  if(rt<=currentBet)return{action:'check'};
  if(rt>=chips+currentBet)return{action:'allin'};
  return{action:'raise',amount:rt};
}
// [Codex fix 2026-05-27] TモードのAIもショート帯ではcallを減らし、open jam / reshove / foldへ寄せる。
function aiTournamentPreflopDecision(player,game,handFrac,ri,pos,isRaisedPot,toCall,pot,prof){
  const tctx=game.tournamentContext;
  if(!tctx||!tctx.enabled)return null;
  const bb=game.bigBlind||1;
  const stackBB=Math.max(1,Math.round(player.chips/bb));
  // [Codex fix 2026-06-05] 20BB reshove練習は周辺スタックのAIも通常flatへ戻さず、30BBまでは専用前提を保つ。
  // [Codex fix 2026-06-25] テーマ付きT練習では27〜40BB程度でもリング用AIへ戻さず、ICM/アンティ文脈を保つ。
  const keepTournamentAI=['bubble_call','ft_payjump','bbante_steal','bb_defend','openjam14','reshove20','hu_aggression'].includes(tctx.focusId);
  if(stackBB>25&&!(keepTournamentAI&&stackBB<=40)&&!(tctx.focusId==='reshove20'&&stackBB<=30))return null;
  // [Codex fix 2026-06-26] AIの実行側も評価側と同じく、バブル/FTのチケット圧を文字列だけに依存せず扱う。
  const bubble=tctx.phase==='バブル'||['bubble_call','ft_payjump'].includes(tctx.focusId);
  const cover=stackCoverInfo(player,game.players,bb);
  const covered=cover.coverState==='covered'||cover.coverState==='mixed_covered';
  const covering=cover.coverState==='covering'||cover.coverState==='mixed_covering';
  const r=tournamentAiRule(stackBB,pos,bubble,ri,handFrac,tctx.focusId);
  const tags=r.tags;
  const canJamByShape=tags.premium||tags.wheelAxs||tags.pairPush||tags.suitedBroadway||tags.suitedConnector;
  const canFlatByShape=ri.suited||tags.pair||tags.suitedConnector||tags.suitedBroadway;
  const jamAdj=bubble&&covered?0.72:bubble&&covering?1.12:1.0;
  const callAdj=bubble&&covered?0.62:bubble&&covering?0.88:1.0;

  if(!isRaisedPot&&pos!=='BB'){
    // [Codex fix 2026-05-28] BB defense drills should face standard opens, not AI jams before hero.
    const suppressOpenJam=tctx.focusId==='bb_defend';
    // [Codex fix 2026-06-27] HU攻防練習ではSB/BTNの即フォールドで終わる手を減らす。
    // HUはレンジが広いこと自体を学ぶモードなので、弱めでもリンプ/小さめオープンを多めに残す。
    if(tctx.focusId==='hu_aggression'&&pos==='SB'){
      const target=Math.round(Math.min(bb*r.openSize,player.chips+player.currentBet));
      if(handFrac<=Math.max(r.openCap*1.35,0.72)){
        if(handFrac<=Math.max(r.openCap*0.92,0.48)&&Math.random()<0.68){
          return aiSizedAction(target,player.chips,player.currentBet);
        }
        return{action:'call'};
      }
      return{action:'call'};
    }
    // [Codex fix 2026-06-27] BBディフェンス練習では、Hero BBに必ずオープンが届くよう、後ろ寄りAIの標準オープンを優先する。
    if(tctx.focusId==='bb_defend'){
      const bbOpenPos=['MP','LJ','HJ','CO','BTN','SB'].includes(pos);
      if(bbOpenPos&&handFrac<=Math.max(r.openCap*1.35,0.24)){
        const target=Math.round(Math.min(bb*r.openSize,player.chips+player.currentBet));
        return aiSizedAction(target,player.chips,player.currentBet);
      }
      return{action:'fold'};
    }
    if(!suppressOpenJam&&handFrac<=r.openJamCap*jamAdj&&canJamByShape&&Math.random()<r.jamFreq*jamAdj){
      return{action:'allin'};
    }
    if(handFrac<=r.openCap){
      const target=Math.round(Math.min(bb*r.openSize,player.chips+player.currentBet));
      return aiSizedAction(target,player.chips,player.currentBet);
    }
    return{action:'fold'};
  }

  if(isRaisedPot){
    // [Codex fix 2026-05-28] Keep non-BB AI from turning BB defense scenarios into squeeze/jam spots.
    if(tctx.focusId==='bb_defend'&&pos!=='BB'){
      if(canFlatByShape&&handFrac<=r.flatCap*1.25&&toCall<player.chips)return{action:'call'};
      return{action:'fold'};
    }
    // [Codex fix 2026-06-05] 20BB reshove練習では、非BBのAI前提もflatで濁さずreshove/foldに寄せる。
    if(tctx.focusId==='reshove20'&&pos!=='BB'){
      if(handFrac<=r.reshoveCap*jamAdj&&canJamByShape&&Math.random()<((tags.premium?0.94:r.reshoveFreq)*jamAdj)){
        return{action:'allin'};
      }
      return{action:'fold'};
    }
    if(tctx.focusId==='openjam14'&&pos!=='BB'){
      if(handFrac<=r.reshoveCap*jamAdj&&canJamByShape&&Math.random()<((tags.premium?0.92:r.reshoveFreq)*jamAdj)){
        return{action:'allin'};
      }
      return{action:'fold'};
    }
    if(pos==='BB'){
      if(handFrac<=r.bbJamCap*jamAdj&&canJamByShape&&Math.random()<r.reshoveFreq*jamAdj){
        return{action:'allin'};
      }
      if(handFrac<=r.bbDefendCap*callAdj&&toCall<player.chips)return{action:'call'};
      return{action:'fold'};
    }
    // [Codex fix 2026-06-27] バブル/FT付近の非BBは、広いフラットで事故るよりreshove/foldを優先する。
    if(bubble&&pos!=='BB'){
      if(handFrac<=r.reshoveCap*jamAdj&&canJamByShape&&Math.random()<((tags.premium?0.92:r.reshoveFreq)*jamAdj)){
        return{action:'allin'};
      }
      return{action:'fold'};
    }
    if(stackBB<=20){
      if(handFrac<=r.reshoveCap*jamAdj&&canJamByShape&&Math.random()<((tags.premium?0.92:r.reshoveFreq)*jamAdj)){
        return{action:'allin'};
      }
      if(!bubble&&canFlatByShape&&handFrac<=r.flatCap*callAdj&&toCall<player.chips&&Math.random()<0.18)return{action:'call'};
      return{action:'fold'};
    }
    if(canFlatByShape&&handFrac<=r.flatCap*callAdj&&toCall<player.chips)return{action:'call'};
  }
  return null;
}
function aiHasNutFlushBlocker(holeCards,comm){
  const suits={};
  comm.forEach(c=>suits[c.suit]=(suits[c.suit]||0)+1);
  const flushSuit=Object.keys(suits).find(s=>suits[s]>=3);
  return !!flushSuit&&holeCards.some(c=>c.suit===flushSuit&&c.rank==='A');
}

// ---- AI DECISION ----
function aiDecide(player,game,baseLevel){
  const prof=player.profile||AI_PROFILES.take;
  const {holeCards,chips,currentBet}=player;
  const toCall=Math.max(0,game.currentBet-currentBet);
  const pot=game.pot,comm=game.community;
  const nAct=game.players.filter(p=>p.active&&!p.folded).length;
  const multi=nAct>2;
  const n=()=>(Math.random()*2-1)*prof.noise;
  const bb=game.bigBlind;

  if(comm.length===0){
    const ht=handType(holeCards[0],holeCards[1]);
    const handFrac=HAND_COMBO_FRAC[ht]||0.99; // コンボ累積比 0=最強側, 1=最弱側
    const pos=posLabel(player.seatIndex,game.dealerIndex,game.players.length);
    const isRaisedPot=game.currentBet>game.bigBlind;
    const aiPfRaisesSoFar=game.currentHandDecisions.filter(d=>d.street==='preflop'&&(d.action==='raise'||d.action==='allin'));
    const lastPfRaiseForAI=aiPfRaisesSoFar[aiPfRaisesSoFar.length-1]||null;
    const openerPosForAI=lastPfRaiseForAI?(lastPfRaiseForAI.position||posLabel(lastPfRaiseForAI.playerIdx,game.dealerIndex,game.players.length)):null;
    const ri=aiRankInfo(holeCards);
    const tPreflop=aiTournamentPreflopDecision(player,game,handFrac,ri,pos,isRaisedPot,toCall,pot,prof);
    if(tPreflop)return tPreflop;

    // ポジション別GTO基準レンジ幅 (コンボ数ベースの上位X%)
    const posRanges=POS_RANGE[baseLevel]||POS_RANGE.medium;
    const baseOpenPct=posRanges[pos]||0.20;
    const midOpenPct=posRanges['HJ']||0.25;

    // posAwareブレンド: 低posAware=全ポジション同じ幅でプレー
    const effOpenPct=baseOpenPct*prof.posAware+midOpenPct*(1-prof.posAware);

    // プロファイル調整: openWidthMult > 1.0 = ルーズ, < 1.0 = タイト
    // [Codex fix 2026-06-25] AIのリングオープンも評価表の$2/$5ライブ上限へ寄せる。EP/MPの謎オープンを減らす。
    const aiPfModeOpen=getRangeMode();
    const liveOpenCap=live25OpenPct(pos,game.players.length)+(prof.openWidthMult>1.05?0.02:0);
    const gtoOpenCap=Math.min(0.85,(POS_RANGE.medium[pos]||baseOpenPct)*1.10+(prof.openWidthMult>1.05?0.03:0));
    const modeOpenCap=aiPfModeOpen==='gto'?gtoOpenCap:liveOpenCap;
    const modeOpenMult=aiPfModeOpen==='gto'?1.04:0.98;
    const adjOpenPct=Math.min(0.85, Math.min(effOpenPct*prof.openWidthMult*modeOpenMult,modeOpenCap));

    // ノイズ: コンボフラクションに直接加算 (±noise*3%)
    const noiseAdj=(Math.random()*2-1)*prof.noise*0.03;
    const effOpenPctN=Math.max(0.01, adjOpenPct+noiseAdj);

    // ① BBオプション（誰もレイズしていない）
    if(pos==='BB'&&!isRaisedPot){
      // BBスクイーズ: 上位10%コンボで40%の確率でレイズ
      const squeezePct=Math.min(0.85, 0.10*prof.openWidthMult);
      if(handFrac<=squeezePct&&Math.random()<0.40){
        const amt=Math.round(Math.min(bb*(2.5+Math.random()*0.5)*prof.betSizeMult,chips));
        return{action:'raise',amount:Math.max(amt,bb*2)};
      }
      return{action:'check'};
    }

    // ② BB vs レイズ (MDF防御, コンボフラクションベース)
    if(pos==='BB'&&isRaisedPot){
      const mdf=pot/(pot+toCall);
      const eMDF=Math.min(0.85,mdf*prof.bbDefenseWidth);
      // handFrac<=defendPct のコンボで守る
      // [fix 2026-06-10] MDF=守る頻度そのもの。1-eMDFは方向が逆だったため修正。
      let defendPct=eMDF*Math.sqrt(prof.openWidthMult);
      // [Codex fix 2026-06-25] BB防衛はポットオッズだけでなく、オープナー位置と形状で上限をかける。
      const earlyOpenAI=['UTG','UTG+1','MP','LJ'].includes(openerPosForAI);
      const midOpenAI=['HJ','CO'].includes(openerPosForAI);
      let liveDefCap=earlyOpenAI?0.40:midOpenAI?0.50:openerPosForAI==='BTN'?0.58:openerPosForAI==='SB'?0.70:0.48;
      if(ri.suited)liveDefCap+=0.05;
      if(ri.pair)liveDefCap+=0.05;
      if(!ri.suited&&ri.hi===14&&ri.lo<=5&&earlyOpenAI)liveDefCap-=0.08;
      defendPct=Math.min(defendPct,Math.max(0.18,liveDefCap));
      // [Codex fix 2026-06-27] BBも「ポットオッズだけ」でレンジ表外のオフスートを守らない。
      const bbDefChartForAI=preflopChartLookup('flat',ht,pos,game.players.length,{openerPos:openerPosForAI});
      if(bbDefChartForAI.status==='out')return{action:'fold'};
      const threeBetPct=0.06; // 上位6%コンボ=3bet候補
      if(handFrac<=defendPct){
        if(handFrac<=threeBetPct&&Math.random()<0.50&&!prof.callBias){
          return{action:'raise',amount:Math.round(Math.min(toCall*3*prof.betSizeMult,chips))};
        }
        if(toCall>=chips)return{action:'call'};
        return{action:'call'};
      }
      return{action:'fold'};
    }

    // ③ オープンレイズ (誰もレイズしていない)
    if(!isRaisedPot){
      // [Codex fix 2026-06-26] 通常AIはプリフロップ表でoutのハンドをプロフィール補正だけで開かない。
      const openChartForAI=preflopChartLookup('open',ht,pos,game.players.length,{});
      const mixFreqBase=aiPfModeOpen==='gto'?(prof.openWidthMult>1.4?0.70:0.50):(prof.openWidthMult>1.4?0.50:0.28);
      const openMixOk=openChartForAI.status==='pure'||(openChartForAI.status==='mix'&&Math.random()<mixFreqBase);
      if(handFrac<=effOpenPctN&&openMixOk){
        const mult=2.3+Math.random()*0.5;
        const amt=Math.round(Math.min(bb*mult*prof.betSizeMult,chips));
        return{action:'raise',amount:Math.max(amt,Math.round(bb*2.3))};
      }
      // SBのみ稀にリンプ (レンジのすぐ外側)
      if(pos==='SB'&&openChartForAI.status!=='out'&&handFrac<=effOpenPctN*1.15&&Math.random()<0.18){
        if(toCall>=chips)return{action:'call'};
        return{action:'call'};
      }
      return{action:'fold'};
    }

    // ④ コール/3ベット/フォールド (レイズ済みポット)
    // コールレンジ: オープンレンジの約1.4倍 (コンボフラクションベース)
    const pfRaises=aiPfRaisesSoFar;
    const lastRaise=lastPfRaiseForAI;
    const callersSinceRaise=lastRaise?game.currentHandDecisions.filter(d=>d.street==='preflop'&&d.action==='call'&&d.playerIdx!==player.id).length:0;
    const isWheelAxs=ri.suited&&ri.hi===14&&ri.lo<=5;
    const isBigBroadway=ri.hi>=13&&ri.lo>=10;
    const isPremium=handFrac<=0.065;
    const isPlayableSuited=ri.suited&&handFrac<=0.28;
    const aiPfMode=getRangeMode();
    const posHardCap={UTG:0.14,'UTG+1':0.16,MP:0.20,LJ:0.22,HJ:0.25,CO:0.30,BTN:0.34,SB:0.12}[pos]||0.22;
    const coldCapBase=Math.min(posHardCap,aiColdCallCap(pos,ri.suited,callersSinceRaise>0)*prof.openWidthMult);
    const coldCap=aiPfMode==='gto'?coldCapBase*0.86:coldCapBase*1.04;
    const threeBetPctAi=Math.min(aiPfMode==='gto'?0.135:0.095,Math.max(0.045,adjOpenPct*(aiPfMode==='gto'?0.42:0.30)));
    const squeezeTarget=Math.round(Math.min(game.currentBet*(callersSinceRaise?4.1:3.2)+callersSinceRaise*bb*1.4,chips+currentBet));
    const threeBetTarget=Math.round(Math.min(game.currentBet*(callersSinceRaise?4.0:3.1)*prof.betSizeMult,chips+currentBet));

    if(isPremium){
      const premium3BetChartForAI=preflopChartLookup('3bet',ht,pos,game.players.length,{openerPos:openerPosForAI});
      const premium3BetOk=handFrac<=0.025||premium3BetChartForAI.status!=='out';
      const premiumRaiseFreq=handFrac<=0.025?0.96:(prof.callBias?0.78:0.90);
      if(premium3BetOk&&Math.random()<premiumRaiseFreq)return aiSizedAction(threeBetTarget,chips,currentBet);
      if(toCall<chips)return{action:'call'};
      return{action:'call'};
    }
    if(pos==='SB'){
      const sbSqueezeChart=preflopChartLookup('3bet',ht,pos,game.players.length,{openerPos:openerPosForAI});
      const sbSqueezeOk=sbSqueezeChart.status!=='out';
      if(sbSqueezeOk&&isWheelAxs&&Math.random()<0.42&&!prof.callBias)return aiSizedAction(squeezeTarget,chips,currentBet);
      if(sbSqueezeOk&&(isBigBroadway||isPlayableSuited)&&handFrac<=0.18&&Math.random()<0.28&&!prof.callBias)return aiSizedAction(squeezeTarget,chips,currentBet);
      if(handFrac<=coldCap&&ri.suited&&callersSinceRaise===0&&Math.random()<0.18){
        if(toCall>=chips)return{action:'call'};
        return{action:'call'};
      }
      return{action:'fold'};
    }
    const wheelAxs3betFreq=aiPfMode==='gto'?0.48:0.28;
    const threeBetChartForAI=preflopChartLookup('3bet',ht,pos,game.players.length,{openerPos:openerPosForAI});
    const threeBetChartOk=threeBetChartForAI.status!=='out'||(aiPfMode==='gto'&&isWheelAxs);
    if(threeBetChartOk&&(handFrac<=threeBetPctAi||isWheelAxs)&&(Math.random()<(isWheelAxs?wheelAxs3betFreq:0.58))&&!prof.callBias){
      return aiSizedAction(threeBetTarget,chips,currentBet);
    }
    // [Codex fix 2026-06-27] 非BBフラットもレンジ表外なら、ルースAI補正だけでコールさせない。
    const flatChartForAI=preflopChartLookup('flat',ht,pos,game.players.length,{openerPos:openerPosForAI});
    if(flatChartForAI.status==='out')return{action:'fold'};
    if(handFrac<=coldCap+noiseAdj){
      const callPo=toCall/(pot+toCall);
      const realizedPenalty=(pos==='UTG'||pos==='UTG+1'||pos==='MP')?0.08:(callersSinceRaise>0?0.06:0.03);
      const callEq=Math.max(0.10,0.84-handFrac*0.78-realizedPenalty)+n()*0.04;
      const dominatedOffsuit=!ri.suited&&!ri.pair&&(ri.hi===14&&ri.lo<=11||ri.hi>=12&&ri.lo>=9);
      if(!dominatedOffsuit&&callEq>callPo+0.015){
        if(toCall>=chips)return{action:'call'};
        return{action:'call'};
      }
    }
    return{action:'fold'};
    // [Claude fix 2026-05-23] ↑ここで全ての preflop パスを return している。
    // 以下は旧実装の残骸（callPct未定義 / 到達不能）のため削除済み。
  }

  // Postflop
  const ev=HandEval.evaluate([...holeCards,...comm]);
  let str=[0.05,0.22,0.48,0.62,0.73,0.81,0.88,0.95,0.98,1.0][ev.cat];
  const eq=estimateEquity(holeCards,comm,Math.max(1,nAct-1),250);
  str=str*0.38+eq*0.62+n()*0.04;
  const po=toCall>0?toCall/(pot+toCall):0;
  let bFreq=prof.bluffFreq*aiBluffModeMult(comm.length>=5);
  if(multi&&!prof.ignoreMultiway)bFreq*=0.25;
  const cantFold=prof.cantFoldMadeHand&&ev.cat>=1&&str>0.28;
  const role=handRole(holeCards,comm,ev);
  const isRiver=comm.length>=5;
  const roleName=role.role||'unknown';
  const pairTier=role.pairTier||'';
  // [Codex fix 2026-05-26] ミドルペア+OESD/FDは弱いメイド単体ではなく、セミブラフ可能な複合ハンドとして扱う。
  const strongMadeDraw=!!(role.draw&&role.draw.outs>=8&&comm.length<5);
  const isWeakMade=(roleName==='medium'||pairTier==='bottom_pair'||pairTier==='low_pair'||pairTier==='under_pair'||pairTier==='board_pair')&&!strongMadeDraw;
  const hasRealDraw=(roleName==='draw'||strongMadeDraw)&&comm.length<5;

  if(toCall===0){
    const myPos=posLabel(player.seatIndex,game.dealerIndex,game.players.length);
    // OOP判定: SB/BBはポストフロップで先行動 → ドンクベット状況
    // UTG等のマルチウェイOOPも含めるが、主要なケースはSB/BB
    const isOOP=['BB','SB','UTG','UTG+1'].includes(myPos)&&nAct<=4;

    if(isRiver){
      if(roleName==='nutted'||ev.cat>=5){
        const f=(0.70+Math.random()*0.35)*prof.betSizeMult;
        return aiSizedAction(pot*f,chips,currentBet);
      }
      if(roleName==='strong'&&!isWeakMade&&Math.random()<0.68){
        const f=(role.isVuln?0.42:0.55)+Math.random()*0.18;
        return aiSizedAction(pot*f*prof.betSizeMult,chips,currentBet);
      }
      if(roleName==='value'&&!isWeakMade&&Math.random()<0.34&&!multi){
        const f=0.33+Math.random()*0.14;
        return aiSizedAction(pot*f*prof.betSizeMult,chips,currentBet);
      }
      if(roleName==='air'&&Math.random()<bFreq*0.22&&aiHasNutFlushBlocker(holeCards,comm)&&!multi){
        return aiSizedAction(pot*(0.55+Math.random()*0.18)*prof.betSizeMult,chips,currentBet);
      }
      return{action:'check'};
    }

    const pfAggs=game.currentHandDecisions.filter(d=>d.street==='preflop'&&(d.action==='raise'||d.action==='allin'));
    const wasPFR=pfAggs.length>0&&pfAggs[pfAggs.length-1].playerIdx===player.id;
    if(isOOP&&wasPFR){
      if(roleName==='strong'||roleName==='nutted'||ev.cat>=3){
        const f=(multi?0.38:0.52)+Math.random()*0.16;
        return aiSizedAction(pot*f*prof.betSizeMult,chips,currentBet);
      }
      if(roleName==='value'&&!isWeakMade&&Math.random()<(multi?0.28:0.52)){
        const f=0.34+Math.random()*0.14;
        return aiSizedAction(pot*f*prof.betSizeMult,chips,currentBet);
      }
      if(hasRealDraw&&Math.random()<bFreq*0.55){
        return aiSizedAction(pot*(0.38+Math.random()*0.16)*prof.betSizeMult,chips,currentBet);
      }
    }

    if(isOOP){
      // ---- OOPドンクベット: GTOでは原則禁止 ----
      // 理由: レンジ不利・Cベット権利の放棄・相手にフリーカード献上
      // 許可条件A: ツーペア以上(cat>=2) — バリュー・プロテクション目的
      // 許可条件B: フィッシュ系(donkFreq高)の場合はワンペア強手も含む
      const donkValueOK=(ev.cat>=2&&str>0.55)||(ev.cat>=3&&str>0.45);
      const donkFishOK=prof.donkFreq>=0.15&&ev.cat>=1&&str>0.70; // フィッシュのみ強いワンペアでも
      if((donkValueOK||donkFishOK)&&Math.random()<prof.donkFreq){
        // サイズは小さめ (33-50%ポット): 大きいドンクは読まれやすい
        const f=(0.33+Math.random()*0.17)*prof.betSizeMult;
        const amt=Math.round(Math.min(pot*f,chips));
        if(amt>0)return aiSizedAction(amt,chips,currentBet);
      }
      // ピュアブラフドンク: エア×ブロッカー狙い、非常に稀
      if(ev.cat===0&&str<0.12&&Math.random()<prof.donkFreq*prof.bluffFreq*aiBluffModeMult(comm.length>=5)*0.35){
        const amt=Math.round(Math.min(pot*0.38*prof.betSizeMult,chips));
        if(amt>0)return aiSizedAction(amt,chips,currentBet);
      }
      // OOP: それ以外は全てチェック → 相手のCベットを待つ
      return{action:'check'};
    }

    // ---- IP / PFR: 通常のCベット・バリューベット・ブラフ ----
    // [Claude fix 2026-05-23] str 0.42-0.62 の Cbet 頻度を強化 (旧: 14-32% → 新: 32-55%)
    // マルチウェイ・OOP・弱ペアは据え置き。リバーのみ thin value を抑制。
    if(str>0.62){
      const f=(0.48+Math.random()*0.35)*prof.betSizeMult;
      return aiSizedAction(pot*f,chips,currentBet);
    }
    if(str>0.42){
      // マルチウェイ or 弱made: 低頻度ベット。IP単独ポット: 積極的にCbet
      const _cbetFreq=isWeakMade||multi?0.18:(isRiver?0.30:0.52);
      if(Math.random()<_cbetFreq){
        const f=(0.33+Math.random()*0.22)*prof.betSizeMult;
        return aiSizedAction(pot*f,chips,currentBet);
      }
    }
    if(Math.random()<(hasRealDraw?bFreq:bFreq*0.45)){
      return aiSizedAction(pot*(0.45+Math.random()*0.2)*prof.betSizeMult,chips,currentBet);
    }
    return{action:'check'};
  } else {
    const ft=prof.foldToBetBase+n()*0.07;
    const betFrac=toCall/Math.max(1,pot-toCall);
    const bigPressure=betFrac>=0.65;
    const stickyMade=cantFold&&!isRiver&&!isWeakMade;
    if(isRiver&&roleName==='air')return{action:'fold'};
    if(isRiver&&isWeakMade&&bigPressure&&str<0.66){
      if(Math.random()<0.86)return{action:'fold'};
    }
    if(hasRealDraw&&role.draw&&role.draw.outs>=8&&po<0.34){
      if(toCall>=chips)return str>0.62?{action:'call'}:{action:'fold'};
      return{action:'call'};
    }
    // [Claude fix 2026-05-23] フロップ/ターン: 旧実装は全ての made hand をここで call に落としており
    // レイズへのパスが存在しなかった。nutted/strong のレイズ + ドローセミブラフレイズを追加。
    if(!isRiver&&(roleName!=='air'||hasRealDraw)&&str>po-0.05){
      if(toCall>=chips)return str>0.70?{action:'call'}:{action:'fold'};
      const _isNutTurn=roleName==='nutted'||ev.cat>=6;
      const _isStrongTurn=!_isNutTurn&&(roleName==='strong'||ev.cat>=4);
      const _drawSB=hasRealDraw&&role.draw&&role.draw.outs>=10&&!multi;
      if(_isNutTurn&&Math.random()<0.55*prof.betSizeMult){
        const target=game.currentBet+toCall*(1.9+Math.random()*0.6)*prof.betSizeMult;
        return aiSizedAction(target,chips,currentBet);
      }
      if(_isStrongTurn&&Math.random()<0.28){
        const target=game.currentBet+toCall*(1.6+Math.random()*0.5)*prof.betSizeMult;
        return aiSizedAction(target,chips,currentBet);
      }
      if(_drawSB&&Math.random()<bFreq*0.60){
        const target=game.currentBet+toCall*(1.5+Math.random()*0.4)*prof.betSizeMult;
        return aiSizedAction(target,chips,currentBet);
      }
      return{action:'call'};
    }
    // [Claude fix 2026-05-23] リバー facing-bet: レイズ頻度強化
    // 旧: (cat>=4&&str>0.72) で24%のみ。新: nutted~70%, strong~45%, value(river)~20%
    if(str>po+0.13||stickyMade){
      const _isNutRiv=roleName==='nutted'||ev.cat>=6;
      const _isStrongRiv=!_isNutRiv&&(roleName==='strong'||ev.cat>=4);
      const _isValueRiv=!_isNutRiv&&!_isStrongRiv&&roleName==='value'&&!isWeakMade;
      const _raiseFreq=_isNutRiv?0.70:(_isStrongRiv?0.45:(_isValueRiv?0.20:0));
      if(str>0.65&&_raiseFreq>0&&Math.random()<_raiseFreq){
        const _sz=_isNutRiv?(2.0+Math.random()*0.6):(1.7+Math.random()*0.5);
        return aiSizedAction(game.currentBet+toCall*_sz*prof.betSizeMult,chips,currentBet);
      }
      if(toCall>=chips)return{action:'call'};
      return{action:'call'};
    }
    if(toCall>=chips)return{action:'fold'};
    if(hasRealDraw&&Math.random()<bFreq*0.35){
      const amt=Math.round(Math.min(pot*0.55*prof.betSizeMult,chips));
      if(amt>0)return aiSizedAction(game.currentBet+amt,chips,currentBet);
    }
    if(str>po*(1-ft*0.3)&&Math.random()>ft){
      if(toCall>=chips)return{action:'call'};
      return{action:'call'};
    }
    return{action:'fold'};
  }
}

// ---- GAME ENGINE ----
class Player{
  constructor(id,name,chips,isHuman,si){
    this.id=id;this.name=name;this.chips=chips;this.isHuman=!!isHuman;this.seatIndex=si||0;
    this.profile=null;this.holeCards=[];this.currentBet=0;
    this.folded=false;this.active=true;this.allIn=false;this.totalInvested=0;
  }
  reset(){this.holeCards=[];this.currentBet=0;this.folded=false;this.allIn=false;this.totalInvested=0;}
}
class GameEngine{
  constructor(cfg){
    this.sb=cfg.sb;this.bb=cfg.bb;this.aiLevel=cfg.aiLevel;
    // [Codex fix 2026-05-26] トーナメント局面別モード用の文脈。BBアンティや通過枠を評価に渡す。
    this.tournamentContext=cfg.tournamentContext||null;
    // [Codex fix 2026-05-28] TモードではstackBBをチップ量ではなくBB数として扱い、プリセットBBから開始チップを復元する。
    this.startingChips=(this.tournamentContext&&this.tournamentContext.enabled)
      ?Math.round(this.bb*(this.tournamentContext.stackBB||25))
      :cfg.startingChips;
    this.handNum=0;this.handHistory=[];
    this.players=[new Player(0,'あなた',this.startingChips,true,0)];
    const pool=[...PROFILE_KEYS].sort(()=>Math.random()-0.5);
    for(let i=1;i<cfg.numPlayers;i++){
      const key=pool[(i-1)%pool.length];
      const p=new Player(i,AI_PROFILES[key].displayName,this.startingChips,false,i);
      p.profile=AI_PROFILES[key];
      this.players.push(p);
    }
    this._applyTournamentStackTexture();
    this.dealerIndex=0;this.community=[];this.pot=0;this.currentBet=0;
    this.street='preflop';this.deck=new Deck();this.minRaise=cfg.bb;
    this.actorsRemaining=[];this.currentHandDecisions=[];
    this.waitingForHuman=false;this.gameOver=false;
    this.sbIdx=0;this.bbIdx=1;this._lastWinners=[];this._lastActions={};
  }
  get smallBlind(){return this.sb;}
  get bigBlind(){return this.bb;}
  _applyTournamentStackTexture(){
    const ctx=this.tournamentContext;
    if(!ctx||!ctx.enabled)return;
    const bb=this.bb||1;
    const base=ctx.stackBB||Math.round(this.startingChips/bb)||25;
    const focus=ctx.focusId||'general';
    let mults=[1.45,1.18,1.00,0.82,0.66,0.52,1.28,0.74];
    if(ctx.phase==='バブル'||focus==='bubble_call'||focus==='openjam14')mults=[1.9,1.45,1.12,0.86,0.62,0.48,1.28,0.72];
    else if(focus==='bb_defend')mults=[1.55,1.25,1.05,0.86,0.70,0.58,1.35,0.78];
    else if(focus==='reshove20')mults=[1.55,1.22,1.00,0.82,0.66,0.55,1.35,0.74];
    this.players.forEach((p,i)=>{
      if(p.isHuman){p.chips=Math.round(base*bb);return;}
      const m=mults[(i-1)%mults.length]*(0.92+Math.random()*0.16);
      p.chips=Math.max(Math.round(bb*6),Math.round(base*bb*m));
    });
  }
  _ensurePlayableTournamentStacks(){
    const ctx=this.tournamentContext;
    if(!ctx||!ctx.enabled)return;
    const bb=this.bb||1;
    const ante=ctx.bbAnte||0;
    const minPlayable=Math.max(bb*6,this.sb+bb+ante);
    const base=Math.round(bb*(ctx.stackBB||25));
    this.players.forEach((p,i)=>{
      if(!p.active)return;
      if(!isFinite(p.chips)||p.chips<minPlayable){
        const isHuman=p.isHuman;
        const texture=isHuman?1:([1.35,1.12,0.92,0.76,1.22,0.66,1.48,0.84][Math.max(0,i-1)%8]||1);
        p.chips=Math.max(minPlayable,Math.round(base*texture));
        p.allIn=false;
        p._rebought=true;
      }
    });
  }
  activePlayers(){return this.players.filter(p=>p.active);}
  nonFolded(){return this.activePlayers().filter(p=>!p.folded);}
  liveBettingPlayers(){return this.nonFolded().filter(p=>!p.allIn);}
  _applyTournamentFocusDealer(){
    const ctx=this.tournamentContext;
    if(!ctx||!ctx.enabled||!ctx.focusId||ctx.focusId==='general')return;
    const targets=tournamentFocusTargetPositions(ctx.focusId);
    if(!targets||!targets.length)return;
    // [Codex fix 2026-06-25] テーマ別練習では、まず狙った席に座らせる。席が外れるとBB防衛などの出題前提が崩れる。
    const humanIdx=this.players.findIndex(p=>p.isHuman&&p.active);
    if(humanIdx<0)return;
    const activeN=this.activePlayers().length;
    const target=targets[Math.floor(Math.random()*targets.length)];
    const dealer=dealerForHumanPosition(activeN,target,humanIdx);
    if(dealer!=null&&this.players[dealer]&&this.players[dealer].active){
      this.dealerIndex=dealer;
      ctx._lastTargetPos=target;
    }
  }
  _applyTournamentFocusHoleCards(){
    const ctx=this.tournamentContext;
    if(!ctx||!ctx.enabled||!ctx.focusId||ctx.focusId==='general')return;
    if(ctx.focusId!=='hu_aggression'&&Math.random()>0.72)return;
    const human=this.players.find(p=>p.isHuman&&p.active);
    if(!human||!human.holeCards||human.holeCards.length<2)return;
    const pos=posLabel(this.players.indexOf(human),this.dealerIndex,this.activePlayers().length);
    const allowedPositions=tournamentFocusTargetPositions(ctx.focusId);
    if(allowedPositions&&allowedPositions.length&&!allowedPositions.includes(pos)&&ctx.focusId!=='bubble_call')return;
    human.holeCards.forEach(c=>this.deck.cards.push(c));
    this.deck.shuffle();
    const hand=drawTournamentFocusHand(this.deck.cards,ctx.focusId,pos,ctx.stackBB||Math.round(this.startingChips/this.bb));
    if(hand&&hand.length>=2){
      human.holeCards=hand;
      ctx._lastFocusHand=true;
    }else{
      human.holeCards=[this.deck.deal(),this.deck.deal()];
    }
    if(ctx.focusId==='bb_defend'){
      // [Codex fix 2026-06-25] BB防衛練習では、Heroの前に自然なオープナーを作り、単なるBBチェック局面を減らす。
      const activeN=this.activePlayers().length;
      const preferred=['CO','BTN','HJ','MP','LJ','SB'];
      const candidates=this.players.map((p,i)=>({p,i,pos:posLabel(i,this.dealerIndex,activeN)}))
        .filter(x=>x.p&&x.p.active&&!x.p.isHuman&&preferred.includes(x.pos))
        .sort((a,b)=>preferred.indexOf(a.pos)-preferred.indexOf(b.pos));
      const opener=candidates[0];
      if(opener&&opener.p.holeCards&&opener.p.holeCards.length>=2){
        opener.p.holeCards.forEach(c=>this.deck.cards.push(c));
        this.deck.shuffle();
        // [Codex fix 2026-06-27] BB防衛練習では、オープナーがミックスで降りる手ではなく純粋オープン域を持つようにする。
        const cap=0.50;
        const oHand=_dealRangeHand(this.deck.cards,cap,{role:'openerPure',pos:opener.pos,totalP:activeN,strict:true});
        if(oHand&&oHand.length>=2){
          opener.p.holeCards=oHand;
          ctx._lastBbDefendOpener=opener.pos;
        }
      }
    }
    if(ctx.focusId==='hu_aggression'&&pos==='BB'){
      // [Codex fix 2026-06-27] HU攻防では相手SBにもHUらしい参加候補を持たせる。
      // 72o級の強制リンプではなく、広いが最低限プレイアブルなレンジでBB判断を作る。
      const activeN=this.activePlayers().length;
      const sbOpp=this.players.map((p,i)=>({p,i,pos:posLabel(i,this.dealerIndex,activeN)}))
        .find(x=>x.p&&x.p.active&&!x.p.isHuman&&x.pos==='SB');
      if(sbOpp&&sbOpp.p.holeCards&&sbOpp.p.holeCards.length>=2){
        sbOpp.p.holeCards.forEach(c=>this.deck.cards.push(c));
        this.deck.shuffle();
        const sbHand=drawTournamentFocusHand(this.deck.cards,ctx.focusId,'SB',ctx.stackBB||Math.round(this.startingChips/this.bb));
        if(sbHand&&sbHand.length>=2){
          sbOpp.p.holeCards=sbHand;
          ctx._lastHuOpponentHand=true;
        }
      }
    }
  }
  startHand(){
    // リングゲーム：チップ切れはリバイ（開始スタックに戻す）
    this.players.forEach(p=>{
      if((p.chips<=0||isNaN(p.chips))&&p.active){p.chips=this.startingChips;p._rebought=true;}
    });
    // [Codex fix 2026-06-03] Tモードの練習では、極端な残りチップで開始して即オールインだけになる局面を避ける。
    this._ensurePlayableTournamentStacks();
    if(this.activePlayers().length<2){this.gameOver=true;return;}
    this.handNum++;this.deck.reset();this.community=[];
    this.pot=0;this.currentBet=0;this.street='preflop';this.minRaise=this.bb;
    this.actorsRemaining=[];this.currentHandDecisions=[];
    // [Codex fix 2026-05-30] 新ハンド開始時に前ハンドのアクション表示を残さない。未来のアクションが見えるように見えるため。
    this._lastActions={};
    this.players.forEach(p=>p.reset());
    do{this.dealerIndex=(this.dealerIndex+1)%this.players.length;}
    while(!this.players[this.dealerIndex].active);
    this._applyTournamentFocusDealer();
    for(const p of this.activePlayers())p.holeCards=[this.deck.deal(),this.deck.deal()];
    this._applyTournamentFocusHoleCards();
    this._postBlinds();this._setOrder();
  }
  _ns(from){
    let i=(from+1)%this.players.length,t=0;
    while(t++<this.players.length){if(this.players[i].active&&!this.players[i].folded)return i;i=(i+1)%this.players.length;}
    return from;
  }
  _fb(p,amt){const a=Math.min(amt,p.chips);p.chips-=a;p.currentBet+=a;p.totalInvested+=a;this.pot+=a;if(p.chips===0)p.allIn=true;}
  _deadPost(p,amt){const a=Math.min(amt,p.chips);p.chips-=a;p.totalInvested+=a;this.pot+=a;if(p.chips===0)p.allIn=true;return a;}
  _postBlinds(){
    const n=this.activePlayers().length;
    if(n===2){this.sbIdx=this.dealerIndex;this.bbIdx=this._ns(this.sbIdx);}
    else{this.sbIdx=this._ns(this.dealerIndex);this.bbIdx=this._ns(this.sbIdx);}
    this._fb(this.players[this.sbIdx],this.sb);
    this._fb(this.players[this.bbIdx],this.bb);
    if(this.tournamentContext&&this.tournamentContext.enabled&&this.tournamentContext.bbAnte>0){
      this._bbAntePosted=this._deadPost(this.players[this.bbIdx],this.tournamentContext.bbAnte);
    }else this._bbAntePosted=0;
    this.currentBet=this.bb;this.minRaise=this.bb;
  }
  _buildActors(from){
    const arr=[];let idx=from;
    for(let i=0;i<this.players.length;i++){
      const p=this.players[idx];
      if(p.active&&!p.folded&&!p.allIn)arr.push(idx);
      idx=(idx+1)%this.players.length;
    }
    return arr;
  }
  _setOrder(){
    if(this.street==='preflop'){
      const s=this._ns(this.bbIdx);
      this.actorsRemaining=this._buildActors(s).filter(i=>i!==this.bbIdx);
      const bb=this.players[this.bbIdx];
      if(bb.active&&!bb.folded&&!bb.allIn)this.actorsRemaining.push(this.bbIdx);
    } else {
      this.actorsRemaining=this._buildActors(this._ns(this.dealerIndex));
    }
    this.actionIdx=this.actorsRemaining[0]??-1;
  }
  processAction(pi,action,raiseAmt){
    const p=this.players[pi];
    const toCall=Math.max(0,this.currentBet-p.currentBet);
    const prevBet=this.currentBet;
    const prevMinRaise=this.minRaise;
    const cover=this.tournamentContext&&this.tournamentContext.enabled?stackCoverInfo(p,this.players,this.bb):null;
    const stackPressure=this.tournamentContext&&this.tournamentContext.enabled?tournamentStackPressureInfo(p,this.players,this.bb,this.dealerIndex):null;
    const dec={street:this.street,action,amount:0,potOdds:toCall>0?toCall/(this.pot+toCall):0,position:posLabel(pi,this.dealerIndex,this.activePlayers().length),pot:this.pot,toCall:toCall,facingRaise:this.currentBet>this.bb,playerName:p.name,isHuman:p.isHuman,playerIdx:pi,playerChipsBefore:p.chips,playerBetBefore:p.currentBet};
    if(this.street==='preflop'){
      // [Codex fix 2026-05-28] 3bet/4bet/5bet context must be explicit; facingRaise alone makes 4bet calls look like cold calls.
      const pfAggsBefore=this.currentHandDecisions.filter(x=>x.street==='preflop'&&(x.action==='raise'||x.action==='allin'));
      dec.pfRaiseCountBefore=pfAggsBefore.length;
      dec.pfHumanRaisedBefore=pfAggsBefore.some(x=>x.isHuman);
      dec.pfFacingBetLevel=dec.facingRaise?pfAggsBefore.length+1:0;
      dec.pfActionBetLevel=(action==='raise'||action==='allin')?pfAggsBefore.length+2:dec.pfFacingBetLevel;
    }
    // [Codex fix 2026-06-05] FTの衝突相手評価に使うため、現在ベットを作った直前アグレッサーのスタックを保持する。
    if(toCall>0){
      const aggressors=this.currentHandDecisions.filter(x=>x.street===this.street&&(x.action==='raise'||x.action==='allin'));
      const lastAgg=aggressors.length?aggressors[aggressors.length-1]:null;
      if(lastAgg){
        dec.villainIdx=lastAgg.playerIdx;
        dec.villainName=lastAgg.playerName;
        dec.villainPosition=lastAgg.position;
        dec.villainChipsBefore=lastAgg.playerChipsBefore;
        dec.facingAllIn=lastAgg.action==='allin';
      }
    }
    if(cover){
      dec.coverState=cover.coverState;
      dec.coverLabel=cover.coverLabel;
      dec.coverDeltaBB=cover.coverDeltaBB;
      dec.coveredByCount=cover.coveredByCount;
      dec.coverCount=cover.coverCount;
      dec.coverPressure=coverPressureText(cover.coverState);
    }
    if(stackPressure){
      dec.stackRank=stackPressure.stackRank;
      dec.shortestStackBB=stackPressure.shortestStackBB;
      dec.shortestOppStackBB=stackPressure.shortestOppStackBB;
      dec.bbInHands=stackPressure.bbInHands;
      dec.nextBBPressure=stackPressure.nextBBPressure;
      dec.shorterStackCount=stackPressure.shorterStackCount;
    }
    if(action==='fold'){p.folded=true;}
    else if(action==='check'){}
    else if(action==='call'){
      const a=Math.min(toCall,p.chips);
      p.chips-=a;p.currentBet+=a;p.totalInvested+=a;this.pot+=a;
      dec.amount=a;if(p.chips===0)p.allIn=true;
    } else {
      // allin: 持ちチップのみ（minRaiseで引き上げない）
      // raise: 通常のminRaise強制
      const rt=action==='allin'
        ?p.chips+p.currentBet
        :Math.max(Math.min(raiseAmt,p.chips+p.currentBet),this.currentBet+this.minRaise);
      const a=Math.min(rt-p.currentBet,p.chips);
      p.chips-=a;p.currentBet+=a;p.totalInvested+=a;this.pot+=a;
      // currentBetはrtが現在値を超える場合のみ更新（パーシャルオールインは更新しない）
      if(rt>this.currentBet){
        const raiseSize=rt-this.currentBet;
        if(raiseSize>=this.minRaise)this.minRaise=raiseSize;
        this.currentBet=rt;
      }
      dec.amount=a;if(p.chips===0){p.allIn=true;dec.action='allin';}
    }
    this.currentHandDecisions.push(dec);
    // アクション吹き出し用タイムスタンプ
    if(!this._lastActions)this._lastActions={};
    this._lastActions[pi]={action:dec.action,amount:dec.amount,ts:Date.now(),handNum:this.handNum,playerName:p.isHuman?'あなた':p.name,position:dec.position};
    this.actorsRemaining=this.actorsRemaining.filter(i=>i!==pi);
    // フルレイズのみアクション再開放。パーシャルオールインは再開放しない
    if((action==='raise'||action==='allin')&&this.currentBet>prevBet){
      if(this.currentBet-prevBet>=prevMinRaise){
        this.actorsRemaining=this._buildActors((pi+1)%this.players.length).filter(i=>i!==pi);
      }
    }
    this.actionIdx=this.actorsRemaining[0]??-1;
    this._check();
    return dec;
  }
  _check(){
    if(this.nonFolded().length<=1){this._end();return;}
    if(this.actorsRemaining.length===0){this._next();return;}
  }
  _next(){
    this.players.forEach(p=>p.currentBet=0);
    this.currentBet=0;this.minRaise=this.bb;
    const streets=['preflop','flop','turn','river','showdown'];
    this.street=streets[streets.indexOf(this.street)+1]||'showdown';
    // [Codex fix 2026-06-14] ストリートが変わったら直前アクション表示を消す。
    // 前ストリートのフォールド/チェックが次の判断材料のように見える混乱を防ぐ。
    this._lastActions={};
    if(this.street==='flop')this.community=[this.deck.deal(),this.deck.deal(),this.deck.deal()];
    // [Claude feature 2026-05-23] シナリオモード: ターン/リバーに予約カードを使用（F/G用）
    else if(this.street==='turn')this.community.push(this._scenario&&this._scenario.turnCard?this._scenario.turnCard:this.deck.deal());
    else if(this.street==='river')this.community.push(this._scenario&&this._scenario.riverCard?this._scenario.riverCard:this.deck.deal());
    else if(this.street==='showdown'){while(this.community.length<5)this.community.push(this.deck.deal());this._end();return;}
    this._setOrder();
    // [Codex fix 2026-05-29] 相手が全員オールインなら、残った1人にチェック/ベットを出さず自動ランアウトする。
    if((this.actorsRemaining.length===0||this.liveBettingPlayers().length<=1)&&this.street!=='showdown'){
      this.actorsRemaining=[];this.actionIdx=-1;
      this._next();
    }
  }
  _end(){
    const nf=this.nonFolded();
    let winners;
    if(nf.length===1){winners=[{player:nf[0],playerIdx:this.players.indexOf(nf[0]),amount:this.pot,byFold:true}];}
    else{
      const res=nf.map(p=>({player:p,ev:HandEval.evaluate([...p.holeCards,...this.community])}));
      res.sort((a,b)=>b.ev.score-a.ev.score);
      const top=res[0].ev.score;
      const ws=res.filter(r=>r.ev.score===top);
      const share=Math.floor(this.pot/ws.length);
      winners=ws.map(w=>({player:w.player,playerIdx:this.players.indexOf(w.player),amount:share,eval:w.ev,byFold:false}));
    }
    for(const w of winners)w.player.chips+=w.amount;
    this.handHistory.unshift({
      handNum:this.handNum,winners,community:[...this.community],
      players:this.players.map(p=>({
        name:p.name,isHuman:p.isHuman,holeCards:[...p.holeCards],
        folded:p.folded,chips:p.chips,totalInvested:p.totalInvested,profile:p.profile,
        handResult:p.holeCards.length&&this.community.length?HandEval.evaluate([...p.holeCards,...this.community]):null
      })),
      decisions:[...this.currentHandDecisions],pot:this.pot,street:this.street,
      dealerIndex:this.dealerIndex,bigBlind:this.bb,
      numActive:this.nonFolded().length+this.players.filter(p=>p.active&&p.folded).length,
      scenario:this._scenario||null,pfStory:this._pfStory||null,
      scenarioQuality:this._scenarioQuality||null,
      tournamentContext:this.tournamentContext?{...this.tournamentContext}:null
    });
    this.street='showdown';
  }
  isHumanTurn(){return this.street!=='showdown'&&this.actionIdx>=0&&!!this.players[this.actionIdx]?.isHuman;}
  getToCall(){const h=this.players.find(p=>p.isHuman);return Math.max(0,this.currentBet-h.currentBet);}
}

// ---- GTO TIPS (contextual) ----
const GTO_TIPS=[
  {tags:['preflop','fold'],title:'BBのディフェンスとMDF',
   text:'BBは最後に行動できる反面、常にベットを受ける立場。GTO的には最低でも60-70%の頻度でディフェンスが必要です（MDF＝ポット÷(ポット+ベット)）。フォールドしすぎはブラフを助長します。'},
  {tags:['potodds','call','equity'],title:'ポットオッズとエクイティ',
   text:'コールの正しさは数式で判断：コール額÷(ポット+コール額)=必要エクイティ。自分のエクイティがこれを超えればコール正解。例：$50コール、ポット$100→33%エクイティが必要。'},
  {tags:['position','preflop'],title:'ポジションの重要性',
   text:'BTNはポーカーで最強のポジション。インポジションでは相手のアクションを見てから判断できます。プリフロップのオープン頻度をBTNで最大化しましょう（約40-45%）。'},
  {tags:['flop','cbet'],title:'コンティニュエーションベット',
   text:'プリフロップレイザーはフロップで約60-65%CBETが標準的。ドライボード（K72レインボー）では高頻度・小サイジング、ウェットボード（JT9フラッシュ）では低頻度・大サイジングが有効。'},
  {tags:['allin','spr'],title:'SPR（スタック対ポット比）',
   text:'SPR＝有効スタック÷ポット。SPR<4ならトップペアでコミット可能。SPR>10ではスペキュラティブハンド（スーテッドコネクター等）の価値が上がります。'},
  {tags:['raise','3bet'],title:'3BETレンジの構成',
   text:'3BETはバリュー（AA/KK/QQ/AKs）とブラフのバランスが重要。ブラフにはA5s/A4sなどブロッカー持ちが最適。コール側のレンジを弱くできます。'},
  {tags:['bluff','draw'],title:'フォールドエクイティとセミブラフ',
   text:'ドロー（フラッシュドロー/ストレートドロー）を持ちながらベットするセミブラフは非常に強力です。相手がフォールドしても勝ち、ヒットしても勝つ2つの勝ち筋があります。'},
  {tags:['multiway'],title:'マルチウェイポットの戦略変更',
   text:'3人以上のマルチウェイポットではブラフの価値が激減します。複数の相手全員がフォールドする確率は低いため、ブラフ頻度を下げ、バリューハンドで攻めましょう。'},
  {tags:['value','sizing'],title:'バリューベットのサイジング',
   text:'ストロングハンドでは大きいベット（75-100%ポット）で価値を最大化。ドローヘビーなボードでは大きく、ドライなボードでは小さくが基本です。'},
  {tags:['donk','oop'],title:'ドンクベットの罠',
   text:'ドンクベット（プリフロップレイザーへのOOPからのベット）はGTO的に低頻度が標準。相手のレンジ優位性を無視した頻繁なドンクベットは長期的に損失になります。'},
  {tags:['fold'],title:'フォールドの美学',
   text:'強いハンドも状況によっては正しいフォールドがあります。スタック全体をリスクにさらす前に、相手のベットパターンとボードの状況を冷静に評価しましょう。'},
  {tags:['checkraise'],title:'チェックレイズの活用',
   text:'アウトオブポジション（OOP）ではチェックレイズが重要な武器です。相手のCBETに対して強いハンドやドローでチェックレイズしてポットを構築しましょう。'}
];
// ===== 用語解説 (Glossary) =====
const GLOSSARY=[
  {term:'EV（期待値）',en:'Expected Value',
   text:'長期的に繰り返した場合の平均的な利益。「EV損失」はそのアクションが長期的に損になることを示す。ポーカーは個々のハンドではなくEVを最大化するゲーム。'},
  {term:'エクイティ',en:'Equity',
   text:'現在の状況でのあなたの勝率。例：フロップでAKがポケット99に対してエクイティ約30%。エクイティが高くても、実現できなければ意味がない（→実現率）。'},
  {term:'ポットオッズ',en:'Pot Odds',
   text:'コール額÷(ポット+コール額)。例：50コール、ポット100 → オッズ33%。自分のエクイティがこれを上回ればコール有利。ハンドレビューの「必要○%」はこれ。'},
  {term:'実現率',en:'Equity Realization (RFE)',
   text:'理論上のエクイティをどれだけ実際のEVに変換できるか。OOP（不利ポジション）・ドミネートされやすいハンド・マルチウェイでは実現率が低下する。K4oがK4sより実戦価値が低いのもこの差。'},
  {term:'逆インプライドオッズ',en:'Reverse Implied Odds',
   text:'ヒットしたときに相手のより強いハンドに大きく負けるリスク。AJo vs AKoの関係が典型例。フラッシュドローなしの弱Axはこのリスクが大きい。'},
  {term:'マルチウェイ',en:'Multiway',
   text:'3人以上がフロップに参加しているポット。プレイヤーが増えるほど：①ブラフの成功率が下がる ②ストロングハンドのみ価値を持つ ③CBet頻度は大きく低下する（HUの約50〜65%）。'},
  {term:'OOP / IP',en:'Out of Position / In Position',
   text:'OOP：先にアクションしなければならない不利なポジション（SB,BB,UTG等）。IP：後からアクションできる有利なポジション（BTN,CO等）。BTNは全ストリートでIPのため最強ポジション。'},
  {term:'レンジ',en:'Range',
   text:'特定の状況でプレイヤーが持ちうる手牌の全集合。「レンジ補正」はベット/コール行動から相手のレンジを絞り込むこと。大サイズ2バレルは強いレンジを示すため、エクイティを割り引く。'},
  {term:'ナッツ',en:'The Nuts',
   text:'その時点で可能な最強のハンド。「ナッツアドバンテージ」はレンジ内にナッツを持っている側の優位性。'},
  {term:'カウンターフィット',en:'Counterfeit',
   text:'ボードのカードがあなたの手役を実質的に弱くすること。例：55でフロップ552→ ターン5でクオッドへ。またはKJツーペアがボードにJ出て「JJKKx」型になり全員がツーペアになる状況。'},
  {term:'SPR',en:'Stack-to-Pot Ratio',
   text:'有効スタック÷ポット。SPR<4でトップペアでもコミット可能。SPR>15では弱いハンドでのコミットを避け、スペキュラティブハンド（スーテッドコネクター等）の価値が高まる。'},
  {term:'3BET / 4BET',en:'3-Bet / 4-Bet',
   text:'3BET：オープンレイズへの再レイズ。4BET：3BETへの再々レイズ。3BETはバリュー（AA/KK/QQ/AKs）とブラフのバランスが重要。A5sなどブロッカー持ちが3BETブラフに適している。'},
  {term:'ポラライズ',en:'Polarized Range',
   text:'「ナッツか空気か」の二極化したレンジ。大サイズベットはポラライズレンジを示すことが多い。中程度のハンドは大サイズに対してコールしにくくなる。'},
  {term:'CB（コンティニュエーションベット）',en:'Continuation Bet',
   text:'PFRがフロップでリードベットすること。HUでは約60〜65%が標準。3way以上のマルチウェイでは大幅低下（約35〜45%）。ドライボードは小サイズ高頻度、ウェットボードは大サイズ低頻度。'},
  {term:'セミブラフ',en:'Semi-Bluff',
   text:'フラッシュドローやストレートドローを持ちながらベットすること。相手がフォールドしても、ヒットしても勝てる2つの勝ち筋がある強力な戦略。'},
  {term:'ブロッカー',en:'Blocker',
   text:'相手の強いコンボ数を減らすカード。例：Aを持つとAAを持ちにくくなる。A5sが3BETブラフに向くのはAブロッカーのため。ナッツブロッカーを持つとブラフの成功率が上がる。'},
  {term:'バレル',en:'Barrel',
   text:'ストリートをまたいでベットし続けること。2バレル=フロップ→ターン連続ベット。3バレル=フロップ→ターン→リバーの3ストリートすべてでベット。相手レンジを圧縮しpolarity（二極化）が進む。'},
  {term:'MDF（最小ディフェンス周波数）',en:'Minimum Defense Frequency',
   text:'ブラフを無収益にするための最低限のコール/レイズ頻度。計算式：ポット÷(ポット+ベット)。例：50%ポットベットに対してMDF=67%。これを下回るフォールド頻度はブラフを助長する。'},
  {term:'ドミネイト',en:'Dominated',
   text:'共通のカードで一方が圧倒的に不利な関係。KJo vs AJo（Jがドミネイト）が典型例。ドミネートされたハンドは「見た目のエクイティ」より実戦価値が低く逆インプライドが大きい。'},
  {term:'ハンドランク / コンボ',en:'Hand Rank / Combo',
   text:'ハンドランク：全169通りの手牌種の強さ順。コンボ：スーツを考慮した実際の組み合わせ数。例：AKoは12コンボ、AKsは4コンボ。レンジの計算はコンボ数で行う。'},
  {term:'VPIP',en:'Voluntarily Put $ In Pot',
   text:'自発的にポットにチップを入れた割合。BBとしてBBを支払うだけはカウントされない。プリフロップでコールまたはレイズした手の割合。目標値は6max（当アプリ）で22〜38%。高すぎると弱い手をプレーしすぎ、低すぎると機会損失。'},
  {term:'PFR',en:'Pre-Flop Raise %',
   text:'プリフロップでレイズした割合。目標値は14〜28%（6max）。VPIPとPFRの差が大きいほどパッシブなスタイルを示す。理想的なPFR/VPIP比は65%以上（例：VPIP30% → PFR20%以上）。'},
  {term:'CBet',en:'Continuation Bet %',
   text:'プリフロップでレイズした後、フロップでもベットした割合（継続ベット）。目標値はHUで55〜75%、マルチウェイでは35〜50%。低すぎると相手にタダカードを与え、高すぎると読まれやすくなる。'},
  {term:'F/CBet',en:'Fold to Continuation Bet %',
   text:'相手のCBetに対してフォールドした割合。目標値は35〜55%。高すぎると相手のブラフCBetが丸儲けになる。ドローやミドルペアはコールを検討し、完全なミスにはフォールドが正解。'},
  {term:'WTSD',en:'Went to Showdown %',
   text:'フロップを見たハンドのうちショーダウンまで到達した割合。目標値は20〜30%。高すぎるとリバーまで弱い手を持ち込みすぎ、低すぎると相手のブラフに負け続ける。バリューハンドではコールダウンを増やすことが重要。'},
  {term:'W$SD',en:'Won Money at Showdown %',
   text:'ショーダウンした際に勝利した割合。目標値は50%以上（理想55〜65%）。低いと弱い手でショーダウンしすぎを示す。WTSDとセットで見ることが重要：WTSDが低いのにW$SDも低い場合は判断基準に問題あり。'},
  {term:'AF',en:'Aggression Factor',
   text:'アグレッション・ファクター。(ベット数+レイズ数)÷コール数。ポストフロップでの積極性を示す。目標値は1.5〜4.5。低いとパッシブ（コールステーション気味）、高いと過剰アグレッション。一般的に勝ちプレイヤーは2〜3程度。'},
  {term:'3BET%',en:'3-Bet Percentage',
   text:'相手のオープンレイズに対して再レイズ（3BET）した割合。目標値は8〜14%（6max）。低すぎると相手に安くフロップを見させ、高すぎるとEV損失。バリュー3BETとブラフ3BETのバランスが重要。'},
  {term:'Steal%',en:'Steal Attempt %',
   text:'BTN・CO・SBからのオープンレイズ試み率。目標値はBTNで50〜70%、COで25〜40%。これらのポジションは有利なため、ブラインドを奪うスチールが重要な戦略。'},
  {term:'Limp%',en:'Limp %',
   text:'コールオープン（リンプ）した割合。フォールドorレイズが正しいプリフロップでのパッシブな選択。GTO的にはほぼ0%が理想。BBとSBのコールはポジション特性上カウントされない。'},
];
function renderGlossary(){
  return GLOSSARY.map(function(g){
    return '<div class="gto-tip"><div class="tip-title">'+g.term+'<span style="font-weight:400;color:var(--dim);font-size:10px;margin-left:6px">'+g.en+'</span></div>'+g.text+'</div>';
  }).join('');
}

// ===== ライブ実戦教材 (Phase 6-1) =====
const LIVE_PRACTICE_GUIDES=[
  {title:'テーブル/シート選択',
   text:'勝ちやすさは自分の腕だけで決まりません。深いスタックでルースにコールする相手が多く、強い常連が左に少ない席を優先します。きつい卓で無理に戦うより、良いゲームを選ぶこと自体が大きなEVです。'},
  {title:'ストラドルポット',
   text:'ストラドルが入ると実質BBが大きくなり、スタックは浅くなります。プリフロップは少しタイトに、ポストフロップはSPRが下がる前提でワンペアの扱いを決めます。参加するなら、後ろから大きくアイソされても困りにくい手を選びます。'},
  {title:'ティルトの兆候',
   text:'取り返したい、相手を懲らしめたい、さっきの負けを理由にコールしたい。この感覚が出たら一度席を離れる合図です。正しい判断を続けられない状態では、良いハンドを待っても利益を守れません。'},
  {title:'セッション終了判断',
   text:'勝っている時も負けている時も、疲労と集中力を基準にします。ミスが増えた、リバー判断が雑になった、相手のレンジを考えずにボタンを押している。そう感じたら、まだゲームが良くても終了候補です。'},
  {title:'バンクロール',
   text:'$2/$5は一回の負け額が大きくなりやすいゲームです。生活費とプレー資金を分け、負けても判断が崩れない余裕を持ちます。十分な余裕がない時は、下のレートや短いセッションで練習量を積む方が長く続きます。'},
  {title:'チップハンドリングとエチケット',
   text:'ベット額ははっきり置き、相手のアクション前に余計な反応をしない。ショーダウンでは自分の手を明確に開き、ディーラーや他プレイヤーを急かさない。テーブルで信頼される振る舞いは、長時間プレーするうえで大事な土台です。'}
];
function renderLivePractice(){
  const intro='<div class="gto-tip"><div class="tip-title">ライブ実戦メモ</div>ハンド単体の正解だけでなく、良いゲームを選び、崩れた状態で打たないことも勝率の一部です。ここでは$2/$5ライブで特に差が出る習慣だけを短くまとめます。</div>';
  return intro+LIVE_PRACTICE_GUIDES.map(function(g){
    return '<div class="gto-tip"><div class="tip-title">'+g.title+'</div>'+g.text+'</div>';
  }).join('');
}

// ===== セッション前後チェックリスト (Phase 6-2) =====
const SESSION_CHECK_KEY='fish_tank_session_check_enabled';
const SESSION_NEXT_FOCUS_KEY='fish_tank_session_next_focus';
const SESSION_FOCUS_HISTORY_KEY='fish_tank_session_focus_history';
const SESSION_APPLIED_PRACTICE_KEY='fish_tank_session_applied_practice';
let SESSION_NEXT_FOCUS_FALLBACK=null;
let SESSION_FOCUS_HISTORY_FALLBACK=[];
let SESSION_APPLIED_PRACTICE_FALLBACK=null;
const SESSION_START_CHECKS=[
  '今日の終了時間と最大損失を先に決める',
  '疲労・眠気・焦りが強い日は短いセッションにする',
  '今日の主テーマを一つだけ決める（例: BB防衛、リバーのフォールド）',
  '負けを取り返す目的でプレーしない'
];
const SESSION_END_CHECKS=[
  '一番大きなミスを一つだけ言語化する',
  'ティルトでコール/ブラフした場面がなかったか確認する',
  '終了予定を守れたか確認する',
  '次回の練習テーマを一つだけ決める'
];
function sessionChecklistEnabled(){
  try{
    const v=localStorage.getItem(SESSION_CHECK_KEY);
    return v==null?true:v==='1';
  }catch(e){return true;}
}
function setSessionChecklistEnabled(on){
  try{localStorage.setItem(SESSION_CHECK_KEY,on?'1':'0');}catch(e){}
}
function getStoredSessionNextFocus(){
  try{
    const raw=localStorage.getItem(SESSION_NEXT_FOCUS_KEY);
    if(!raw)return SESSION_NEXT_FOCUS_FALLBACK;
    const parsed=JSON.parse(raw);
    if(parsed&&parsed.title&&parsed.body)return parsed;
  }catch(e){}
  return SESSION_NEXT_FOCUS_FALLBACK;
}
function storeSessionNextFocus(focus){
  if(!focus||!focus.title||!focus.body)return;
  const payload={title:focus.title,body:focus.body,tone:focus.tone||'neutral',baseline:focus.baseline||sessionStatsSnapshot()};
  SESSION_NEXT_FOCUS_FALLBACK=payload;
  try{localStorage.setItem(SESSION_NEXT_FOCUS_KEY,JSON.stringify(payload));}catch(e){}
}
function getStoredAppliedPractice(){
  try{
    const raw=localStorage.getItem(SESSION_APPLIED_PRACTICE_KEY);
    if(!raw)return SESSION_APPLIED_PRACTICE_FALLBACK;
    const parsed=JSON.parse(raw);
    if(parsed&&parsed.mode&&parsed.focus)return parsed;
  }catch(e){}
  return SESSION_APPLIED_PRACTICE_FALLBACK;
}
function storeAppliedPractice(rec){
  if(!rec)return;
  const payload={
    mode:rec.mode||rec.modeValue||'リングゲーム',
    focus:rec.focus||'練習テーマ',
    status:rec.status||'',
    reason:rec.reason||'',
    modeValue:rec.modeValue||'normal',
    focusValue:rec.focusValue||'',
    presetValue:rec.presetValue||'',
    savedAt:Date.now()
  };
  SESSION_APPLIED_PRACTICE_FALLBACK=payload;
  try{localStorage.setItem(SESSION_APPLIED_PRACTICE_KEY,JSON.stringify(payload));}catch(e){}
}
function getSessionFocusHistory(){
  try{
    const raw=localStorage.getItem(SESSION_FOCUS_HISTORY_KEY);
    if(!raw)return SESSION_FOCUS_HISTORY_FALLBACK||[];
    const parsed=JSON.parse(raw);
    if(Array.isArray(parsed))return parsed;
  }catch(e){}
  return SESSION_FOCUS_HISTORY_FALLBACK||[];
}
function storeSessionFocusHistory(list){
  const safe=(Array.isArray(list)?list:[]).slice(0,8);
  SESSION_FOCUS_HISTORY_FALLBACK=safe;
  try{localStorage.setItem(SESSION_FOCUS_HISTORY_KEY,JSON.stringify(safe));}catch(e){}
}
function sessionFocusTitleText(focus){
  return String((focus&&focus.title)||'').replace(/^次回の一点:\s*/,'').replace(/^谺｡蝗槭・荳轤ｹ:\s*/,'');
}
function sessionFocusRepeatCandidate(history){
  const list=(Array.isArray(history)?history:getSessionFocusHistory()).filter(function(it){return it&&it.title;});
  if(list.length<2)return null;
  const title=list[0].title;
  let count=0;
  for(const it of list){
    if(it.title!==title)break;
    if(it.state==='good'||it.state==='pending')break;
    count++;
  }
  if(count<2)return null;
  return{title:title,count:count,state:list[0].state||'warn'};
}
function sessionFocusApplyHistory(profile,history){
  if(!profile||!profile.focus)return profile;
  const repeat=sessionFocusRepeatCandidate(history);
  if(!repeat)return profile;
  const curTitle=sessionFocusTitleText(profile.focus);
  const canContinue=profile.focus.tone==='good'||profile.focus.tone==='neutral'||curTitle===repeat.title;
  if(!canContinue)return profile;
  const next=Object.assign({},profile);
  next.focus={
    title:'次回の一点: '+repeat.title,
    body:'同じテーマが'+repeat.count+'回続いています。新しい課題へ広げるより、まずここをもう一度だけ確認します。今回も同じ場面で迷ったら、判断前に一拍置いてレンジとサイズを見直してください。',
    tone:'warn',
    historyRepeat:repeat.count
  };
  next.historyRepeat=repeat;
  return next;
}
function renderSessionChecklist(items,note){
  return '<div class="session-check-list">'+items.map(function(t){
    return '<div class="session-check-item">'+t+'</div>';
  }).join('')+'</div>'+(note?'<div class="session-check-note">'+note+'</div>':'');
}
function sessionTextHTML(txt){
  return String(txt||'').replace(/[&<>"']/g,function(ch){
    return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];
  });
}
function sessionPracticeRecommendation(focus,stats){
  const txt=((focus&&focus.title)||'')+' '+((focus&&focus.body)||'');
  let rec=null;
  if(/BB防衛|BBディフェンス|defend/i.test(txt))rec={mode:'トーナメント局面別',modeValue:'tournament',focus:'BBディフェンス練習',focusValue:'bb_defend',presetValue:'middle',reason:'BB防衛はポットオッズだけでなく、OOPで払いすぎない感覚まで一緒に練習できます。'};
  else if(/リバー|ワンペア|ショーダウン|WTSD/.test(txt))rec={mode:'リングゲーム',modeValue:'normal',focus:'リバー判断',reason:'ライブ$2/$5で差が出る、ワンペアの受けすぎと薄バリューの切り分けを重点的に見ます。'};
  else if(/ポストフロップ|フロップ|ターン|PostF/.test(txt))rec={mode:'フロップトレーニング',modeValue:'scenario',focus:'ポストフロップ判断',reason:'ボード、ポジション、ベット目的を短い反復で確認できます。'};
  else if(/リンプ|入口|VPIP|参加|フロップ前/.test(txt))rec={mode:'リングゲーム',modeValue:'normal',focus:'フロップ前の入口整理',reason:'参加する手と降りる手を整理し、難しいワンペア判断を最初から減らします。'};
  else if(/ミス|テーマ|振り返り/.test(txt))rec={mode:'リングゲーム',modeValue:'normal',focus:'主テーマ確認',reason:'まずは通常ハンドで、レビューの主テーマを一つずつ潰していきます。'};
  if(!rec)return null;
  const r=sessionFocusActionResult(focus,stats||sessionStats);
  if(r&&r.state==='warn'){
    rec.status='継続推奨';
    rec.reason='前回の行動チェックは「継続」です。'+rec.reason;
  }else if(r&&r.state==='improving'){
    rec.status='あと少し';
    rec.reason='前回は改善途中です。もう一度だけ同じ型で反復すると、判断がかなり固まります。'+rec.reason;
  }else if(r&&r.state==='good'){
    rec.status='確認練習';
    rec.reason='前回はかなり守れています。崩れないか確認する練習として使えます。'+rec.reason;
  }else if(r&&r.state==='pending'){
    rec.status='サンプル集め';
    rec.reason='まだ判定材料が少ないため、まずは同じテーマのハンドを増やします。'+rec.reason;
  }
  return rec;
}
function renderSessionPracticeRecommendation(focus,stats){
  const rec=sessionPracticeRecommendation(focus,stats);
  if(!rec)return '';
  const label=rec.status?'（'+rec.status+'）':'';
  return '<div class="session-recommend"><div class="session-recommend-title">おすすめ練習'+sessionTextHTML(label)+': '+sessionTextHTML(rec.mode)+' / '+sessionTextHTML(rec.focus)+'</div><div class="session-recommend-body">'+sessionTextHTML(rec.reason)+'</div><button type="button" class="session-apply-practice" data-mode="'+sessionTextHTML(rec.modeValue||'normal')+'" data-focus="'+sessionTextHTML(rec.focusValue||'')+'" data-preset="'+sessionTextHTML(rec.presetValue||'')+'" data-mode-label="'+sessionTextHTML(rec.mode||'')+'" data-focus-label="'+sessionTextHTML(rec.focus||'')+'" data-status="'+sessionTextHTML(rec.status||'')+'" data-reason="'+sessionTextHTML(rec.reason||'')+'">この練習を設定</button></div>';
}
function renderAppliedPracticeNote(rec){
  rec=rec||getStoredAppliedPractice();
  if(!rec)return '';
  const label=rec.status?'今日の狙い（'+rec.status+'）':'今日の狙い';
  return '<div class="session-practice-note"><b>'+sessionTextHTML(label)+'</b><span>'+sessionTextHTML((rec.mode||'練習')+' / '+(rec.focus||'テーマ確認'))+'</span>'+sessionTextHTML(rec.reason||'このテーマを意識して開始します。')+'</div>';
}
function refreshAppliedPracticeNote(){
  const el=$('session-practice-note');
  if(el)el.innerHTML=renderAppliedPracticeNote();
  refreshHudPracticeFocus();
}
function appliedPracticeHudText(rec){
  rec=rec||getStoredAppliedPractice();
  if(!rec)return '';
  const focus=String(rec.focus||'テーマ確認').replace(/練習$/,'').replace(/判断$/,'判断');
  const status=rec.status?String(rec.status).replace('推奨',''):'';
  return '今日: '+focus+(status?' / '+status:'');
}
function refreshHudPracticeFocus(){
  const el=$('hud-practice-focus');
  if(!el)return;
  const txt=appliedPracticeHudText();
  el.textContent=txt;
  el.style.display=txt?'block':'none';
}
function sessionFocusActionChecklist(focus){
  const txt=((focus&&focus.title)||'')+' '+((focus&&focus.body)||'');
  if(/リバー|ワンペア|ショーダウン|WTSD/.test(txt))return[
    'リバーでワンペアのまま大きいベットを受けたら、相手のバリュー候補を3つ挙げる',
    '必要勝率だけで決めず、相手に十分なブラフが残るかを確認する',
    '相手がパッシブ寄りなら、迷ったコールは一段フォールド寄りにする'
  ];
  if(/BB防衛|BBディフェンス|defend/i.test(txt))return[
    'BBで守る前に、相手の位置とオープンサイズを確認する',
    'コール後にOOPで困る弱いトップペア型かどうかを見る',
    '守った後は、ワンペアで大きく払いすぎないことを先に決める'
  ];
  if(/ポストフロップ|フロップ|ターン|PostF/.test(txt))return[
    'ベット前に、何にコールしてほしいかを一つ言う',
    'チェック時は、ショーダウン価値を守る目的か諦める目的かを分ける',
    'ターン以降は、落ちたカードで相手レンジが強くなったかを見る'
  ];
  if(/リンプ|入口|VPIP|参加/.test(txt))return[
    '参加前に、レイズで入る手かフォールドする手かを先に決める',
    'OOPでオフスートブロードウェイをコールしすぎない',
    '迷うハンドは、安いからコールではなくフォールド寄りに整理する'
  ];
  if(/ミス|振り返り/.test(txt))return[
    '大きいポットになる前に、一度だけ相手の強いレンジを考える',
    '押したいボタンではなく、推奨ラインとサイズを先に確認する',
    '終わったら一番迷った判断を一つだけメモする'
  ];
  return[
    '今日のテーマを一つだけ決めてから始める',
    '迷った場面は、手役ではなく相手レンジから考える',
    'セッション後に一番大きかった判断を一つだけ振り返る'
  ];
}
function sessionFocusModeKey(focus){
  const txt=((focus&&focus.title)||'')+' '+((focus&&focus.body)||'');
  if(/BB防衛|BBディフェンス|defend/i.test(txt))return 'tournament_bb_defense';
  if(/リバー|ワンペア|ショーダウン|WTSD/.test(txt))return 'ring_river';
  if(/ポストフロップ|フロップ|ターン|PostF/.test(txt))return 'flop_bet_plan';
  if(/リンプ|入口|VPIP|参加/.test(txt))return 'ring_preflop_entry';
  return 'general';
}
function renderSessionFocusActionChecklist(focus){
  if(!focus)return '';
  const items=sessionFocusActionChecklist(focus);
  return '<div class="session-action-plan"><div class="session-action-plan-title">次の1ハンドで見ること</div>'+items.map(function(t){
    return '<div class="session-action-item">'+sessionTextHTML(t)+'</div>';
  }).join('')+'</div>';
}
function sessionFocusActionResult(focus,stats){
  if(!focus)return null;
  stats=stats||sessionStats||{};
  const mode=sessionFocusModeKey(focus);
  const p=sessionEndCarryoverProgress(focus,stats);
  const action=sessionFocusActionChecklist(focus)[0]||'今回のテーマを意識して判断する';
  const pct=function(a,b){return b>0?Math.round(a/b*100):-1;};
  const avg=function(arr){return arr&&arr.length?Math.round(arr.reduce(function(a,b){return a+b;},0)/arr.length):0;};
  if(p.state==='pending'&&mode!=='tournament_bb_defense'&&mode!=='flop_bet_plan')return{state:'pending',title:'行動チェック: 判定待ち',body:'まだサンプルが少ないので、このチェックを数ハンド続けて見ます。',action};
  if(mode==='ring_river'){
    if(p.state==='good')return{state:'good',title:'行動チェック: 守れています',body:'リバーでショーダウンへ行きすぎる量は抑えられています。ワンペアで払う前に、相手の強いレンジを一度見られている可能性が高いです。',action};
    if(p.state==='improving')return{state:'improving',title:'行動チェック: もう少し',body:'かなり締まっていますが、完成ボードや大きいベットではまだ一段だけフォールド寄りにできます。',action};
    return{state:'warn',title:'行動チェック: 継続',body:'まだリバーで受けすぎる可能性があります。次回も、ワンペアで払う前に相手のバリュー候補を先に数えてください。',action};
  }
  if(mode==='flop_bet_plan'){
    const poN=(stats.poScores||[]).length;
    const poAvg=avg(stats.poScores||[]);
    if(poN<4)return{state:'pending',title:'行動チェック: 判定待ち',body:'フロップ以降のサンプルがまだ少ないので、ベット目的の確認をもう少し続けます。',action};
    if(poAvg>=72)return{state:'good',title:'行動チェック: 守れています',body:'フロップトレーニングでは、ベット目的とサイズ選びがかなり安定しています。打つ前に「何に払ってほしいか」を考える形が出ています。',action};
    if(poAvg>=62)return{state:'improving',title:'行動チェック: もう少し',body:'大きな崩れは減っています。次はベット、チェック、コールの目的を各ストリートでもう少しはっきり分けます。',action};
    return{state:'warn',title:'行動チェック: 継続',body:'まだベット目的が曖昧になりやすい状態です。打つ時は、コールしてほしい相手と降ろしたい相手を一つずつ言ってから押してください。',action};
  }
  if(mode==='ring_preflop_entry'){
    if(p.state==='good')return{state:'good',title:'行動チェック: 守れています',body:'参加前にレイズかフォールドかを整理できています。入口で難しいワンペア判断を減らす方向です。',action};
    if(p.state==='improving')return{state:'improving',title:'行動チェック: もう少し',body:'入口はかなり締まっていますが、OOPやオフスート系の迷うコールはまだ削れます。',action};
    return{state:'warn',title:'行動チェック: 継続',body:'まだ参加しすぎ、またはリンプ寄りです。安いからコールではなく、参加前にレイズかフォールドへ整理してください。',action};
  }
  if(mode==='tournament_bb_defense'){
    const total=stats.totalDec||0;
    const miss=pct(stats.badDec||0,total);
    if(total<10)return{state:'pending',title:'行動チェック: 判定待ち',body:'BB防衛の判断サンプルがまだ少ないので、相手位置とサイズを見る確認を続けます。',action};
    if(miss>=0&&miss<=20)return{state:'good',title:'行動チェック: 守れています',body:'トーナメントのBB防衛は大きく崩れていません。守った後にOOPで払いすぎない意識を続けます。',action};
    if(miss<=30)return{state:'improving',title:'行動チェック: もう少し',body:'BBは広く守れますが、守った後の難しいワンペア判断がまだ残ります。相手位置とサイズを見てから守る癖を続けます。',action};
    return{state:'warn',title:'行動チェック: 継続',body:'BB防衛の判断がまだ荒れています。ポットオッズだけで守らず、OOPで払いすぎるハンドかどうかを先に確認してください。',action};
  }
  if(p.state==='good')return{state:'good',title:'行動チェック: 守れています',body:'今回のテーマは大きく崩れていません。次は同じ確認をもう少し速くできるようにします。',action};
  return{state:p.state||'warn',title:'行動チェック: 継続',body:'今回のテーマはまだ残っています。次回も同じチェックを最初の数ハンドで確認します。',action};
}
function renderSessionFocusActionResult(focus,stats){
  const r=sessionFocusActionResult(focus,stats);
  if(!r)return '';
  return '<div class="session-action-result session-action-result-'+(r.state||'pending')+'"><b>'+sessionTextHTML(r.title)+'</b><span>'+sessionTextHTML(r.body)+'</span><small>'+sessionTextHTML(r.action)+'</small></div>';
}
function sessionFocusProgress(focus,stats){
  stats=stats||sessionStats||{};
  const txt=((focus&&focus.title)||'')+' '+((focus&&focus.body)||'');
  const pct=function(a,b){return b>0?Math.round(a/b*100):-1;};
  const avg=function(arr){return arr&&arr.length?Math.round(arr.reduce(function(a,b){return a+b;},0)/arr.length):0;};
  const n=stats.hands||0;
  const limpPct=pct(stats.limp||0,stats.limpOpp||0);
  const vpip=pct(stats.vpip||0,n);
  const wtsd=pct(stats.wtsdWent||0,stats.wtsdSaw||0);
  const mistake=pct(stats.badDec||0,stats.totalDec||0);
  const poN=(stats.poScores||[]).length;
  const avgPO=avg(stats.poScores||[]);
  if(/リンプ/.test(txt)){
    if((stats.limpOpp||0)<3)return{state:'pending',label:'データ待ち',text:'リンプ機会がまだ少ないので、数ハンド続けて入口を確認します。'};
    if(limpPct<=10)return{state:'good',label:'改善中',text:'リンプ率は'+limpPct+'%。入口はかなり整理できています。'};
    if(limpPct<=25)return{state:'improving',label:'あと少し',text:'リンプ率は'+limpPct+'%。かなり減っていますが、まだレイズかフォールドへ寄せられます。'};
    return{state:'warn',label:'継続課題',text:'リンプ率は'+limpPct+'%。前回テーマとしてもう少し続けたい状態です。'};
  }
  if(/入口|VPIP|参加|フロップ前/.test(txt)){
    if(n<5)return{state:'pending',label:'データ待ち',text:'まだハンド数が少ないので、参加レンジの傾向は参考程度です。'};
    if(vpip>=14&&vpip<=38)return{state:'good',label:'改善中',text:'VPIPは'+vpip+'%。参加レンジはかなり自然な範囲に入っています。'};
    if(vpip<=45)return{state:'improving',label:'あと少し',text:'VPIPは'+vpip+'%。大きく崩れてはいませんが、OOPの入口はもう少し締められます。'};
    return{state:'warn',label:'継続課題',text:'VPIPは'+vpip+'%。まだ参加しすぎ寄りなので、入口整理を続けます。'};
  }
  if(/ポストフロップ|フロップ|ターン|PostF/.test(txt)){
    if(poN<4)return{state:'pending',label:'データ待ち',text:'ポストフロップ到達がまだ少ないので、まずは判断サンプルを集めます。'};
    if(avgPO>=70)return{state:'good',label:'改善中',text:'PostF平均は'+avgPO+'pt。ポストフロップ判断は安定してきています。'};
    if(avgPO>=60)return{state:'improving',label:'あと少し',text:'PostF平均は'+avgPO+'pt。大事故は減っていますが、ベット目的と受け方をもう少し磨けます。'};
    return{state:'warn',label:'継続課題',text:'PostF平均は'+avgPO+'pt。まだ大きな失点が残りやすい状態です。'};
  }
  if(/リバー|ワンペア|ショーダウン|WTSD/.test(txt)){
    if((stats.wtsdSaw||0)<5)return{state:'pending',label:'データ待ち',text:'リバー判断のサンプルがまだ少ないので、数ハンド続けて見ます。'};
    if(wtsd>=20&&wtsd<=34)return{state:'good',label:'改善中',text:'WTSDは'+wtsd+'%。ショーダウンへ行きすぎない形に近づいています。'};
    if(wtsd<=40)return{state:'improving',label:'あと少し',text:'WTSDは'+wtsd+'%。かなり締まっていますが、完成ボードのワンペア受けはもう一段見ます。'};
    return{state:'warn',label:'継続課題',text:'WTSDは'+wtsd+'%。まだリバーで受けすぎる可能性があります。'};
  }
  if(/ミス/.test(txt)){
    if((stats.totalDec||0)<10)return{state:'pending',label:'データ待ち',text:'判断数がまだ少ないので、大きなミスの傾向はもう少し見ます。'};
    if(mistake<=20)return{state:'good',label:'改善中',text:'ミス率は'+mistake+'%。大きな失点はかなり抑えられています。'};
    if(mistake<=30)return{state:'improving',label:'あと少し',text:'ミス率は'+mistake+'%。改善は見えますが、まだ一つ大きな判断を減らせます。'};
    return{state:'warn',label:'継続課題',text:'ミス率は'+mistake+'%。前回テーマをもう少し続ける価値があります。'};
  }
  return{state:'pending',label:'確認中',text:'前回テーマを意識して、今回のセッションでも同じ一点を見ます。'};
}
function sessionStatsSnapshot(stats){
  stats=stats||sessionStats||{};
  const poScores=stats.poScores||[];
  return{
    hands:stats.hands||0,
    vpip:stats.vpip||0,
    limp:stats.limp||0,
    limpOpp:stats.limpOpp||0,
    wtsdSaw:stats.wtsdSaw||0,
    wtsdWent:stats.wtsdWent||0,
    badDec:stats.badDec||0,
    totalDec:stats.totalDec||0,
    poCount:poScores.length,
    poSum:poScores.reduce(function(a,b){return a+b;},0)
  };
}
function sessionStatsSinceBaseline(stats,base){
  const snap=sessionStatsSnapshot(stats);
  if(!base)return null;
  const sub=function(a,b){return Math.max(0,Math.round((a||0)-(b||0)));};
  const poCount=sub(snap.poCount,base.poCount);
  const poSum=Math.max(0,(snap.poSum||0)-(base.poSum||0));
  return{
    hands:sub(snap.hands,base.hands),
    vpip:sub(snap.vpip,base.vpip),
    limp:sub(snap.limp,base.limp),
    limpOpp:sub(snap.limpOpp,base.limpOpp),
    wtsdSaw:sub(snap.wtsdSaw,base.wtsdSaw),
    wtsdWent:sub(snap.wtsdWent,base.wtsdWent),
    badDec:sub(snap.badDec,base.badDec),
    totalDec:sub(snap.totalDec,base.totalDec),
    poCount:poCount,
    poAvg:poCount>0?Math.round(poSum/poCount):0
  };
}
function sessionFocusProgress(focus,stats){
  stats=stats||sessionStats||{};
  const txt=((focus&&focus.title)||'')+' '+((focus&&focus.body)||'');
  const pct=function(a,b){return b>0?Math.round(a/b*100):-1;};
  const avg=function(arr){return arr&&arr.length?Math.round(arr.reduce(function(a,b){return a+b;},0)/arr.length):0;};
  const delta=sessionStatsSinceBaseline(stats,focus&&focus.baseline);
  const scoped=!!delta;
  const n=scoped?delta.hands:(stats.hands||0);
  const poN=scoped?delta.poCount:(stats.poScores||[]).length;
  const avgPO=scoped?delta.poAvg:avg(stats.poScores||[]);
  const limpOpp=scoped?delta.limpOpp:(stats.limpOpp||0);
  const limpPct=scoped?pct(delta.limp,delta.limpOpp):pct(stats.limp||0,stats.limpOpp||0);
  const vpip=scoped?pct(delta.vpip,delta.hands):pct(stats.vpip||0,n);
  const wtsdSaw=scoped?delta.wtsdSaw:(stats.wtsdSaw||0);
  const wtsd=scoped?pct(delta.wtsdWent,delta.wtsdSaw):pct(stats.wtsdWent||0,stats.wtsdSaw||0);
  const totalDec=scoped?delta.totalDec:(stats.totalDec||0);
  const mistake=scoped?pct(delta.badDec,delta.totalDec):pct(stats.badDec||0,stats.totalDec||0);
  const prefix=scoped?'前回テーマ後は':'';
  if(/リンプ|繝ｪ繝ｳ繝/.test(txt)){
    if(limpOpp<3)return{state:'pending',label:'データ待ち',text:(scoped?'前回テーマ後の':'')+'リンプ機会がまだ少ないので、数ハンド続けて入口を確認します。'};
    if(limpPct<=10)return{state:'good',label:'改善中',text:prefix+'リンプ率は'+limpPct+'%。入口はかなり整理できています。'};
    if(limpPct<=25)return{state:'improving',label:'あと少し',text:prefix+'リンプ率は'+limpPct+'%。かなり減っていますが、まだレイズかフォールドへ寄せられます。'};
    return{state:'warn',label:'継続課題',text:prefix+'リンプ率は'+limpPct+'%。前回テーマとしてもう少し続けたい状態です。'};
  }
  if(/入口|VPIP|参加|フロップ前|蜈･蜿｣|蜿ょ刈/.test(txt)){
    if(n<5)return{state:'pending',label:'データ待ち',text:(scoped?'前回テーマ後の':'')+'ハンド数がまだ少ないので、参加レンジの傾向は参考程度です。'};
    if(vpip>=14&&vpip<=38)return{state:'good',label:'改善中',text:prefix+'VPIPは'+vpip+'%。参加レンジはかなり自然な範囲に入っています。'};
    if(vpip<=45)return{state:'improving',label:'あと少し',text:prefix+'VPIPは'+vpip+'%。大きく崩れてはいませんが、OOPの入口はもう少し締められます。'};
    return{state:'warn',label:'継続課題',text:prefix+'VPIPは'+vpip+'%。まだ参加しすぎ寄りなので、入口整理を続けます。'};
  }
  if(/ポストフロップ|フロップ|ターン|PostF|繝昴せ繝医ヵ繝ｭ/.test(txt)){
    if(poN<4)return{state:'pending',label:'データ待ち',text:(scoped?'前回テーマ後の':'')+'ポストフロップ到達がまだ少ないので、まずは判断サンプルを集めます。'};
    if(avgPO>=70)return{state:'good',label:'改善中',text:prefix+'PostF平均は'+avgPO+'pt。ポストフロップ判断は安定してきています。'};
    if(avgPO>=60)return{state:'improving',label:'あと少し',text:prefix+'PostF平均は'+avgPO+'pt。大事故は減っていますが、ベット目的と受け方をもう少し磨けます。'};
    return{state:'warn',label:'継続課題',text:prefix+'PostF平均は'+avgPO+'pt。まだ大きな失点が残りやすい状態です。'};
  }
  if(/リバー|ワンペア|ショーダウン|WTSD|繝ｪ繝舌|繝ｯ繝ｳ/.test(txt)){
    if(wtsdSaw<5)return{state:'pending',label:'データ待ち',text:(scoped?'前回テーマ後の':'')+'リバー判断のサンプルがまだ少ないので、数ハンド続けて見ます。'};
    if(wtsd>=20&&wtsd<=34)return{state:'good',label:'改善中',text:prefix+'WTSDは'+wtsd+'%。ショーダウンへ行きすぎない形に近づいています。'};
    if(wtsd<=40)return{state:'improving',label:'あと少し',text:prefix+'WTSDは'+wtsd+'%。かなり締まっていますが、完成ボードのワンペア受けはもう一段見ます。'};
    return{state:'warn',label:'継続課題',text:prefix+'WTSDは'+wtsd+'%。まだリバーで受けすぎる可能性があります。'};
  }
  if(/ミス|繝溘せ/.test(txt)){
    if(totalDec<10)return{state:'pending',label:'データ待ち',text:(scoped?'前回テーマ後の':'')+'判断数がまだ少ないので、大きなミスの傾向はもう少し見ます。'};
    if(mistake<=20)return{state:'good',label:'改善中',text:prefix+'ミス率は'+mistake+'%。大きな失点はかなり抑えられています。'};
    if(mistake<=30)return{state:'improving',label:'あと少し',text:prefix+'ミス率は'+mistake+'%。改善は見えますが、まだ一つ大きな判断を減らせます。'};
    return{state:'warn',label:'継続課題',text:prefix+'ミス率は'+mistake+'%。前回テーマをもう少し続ける価値があります。'};
  }
  return{state:'pending',label:'確認中',text:(scoped?'前回テーマ後のデータを見ながら、':'')+'今回のセッションでも同じ一点を見ます。'};
}
function sessionFocusProgressSample(focus,stats){
  stats=stats||sessionStats||{};
  const txt=((focus&&focus.title)||'')+' '+((focus&&focus.body)||'');
  const delta=sessionStatsSinceBaseline(stats,focus&&focus.baseline);
  const scoped=!!delta;
  const src=delta||{
    hands:stats.hands||0,
    limpOpp:stats.limpOpp||0,
    wtsdSaw:stats.wtsdSaw||0,
    totalDec:stats.totalDec||0,
    poCount:(stats.poScores||[]).length
  };
  const lead=scoped?'前回後':'累積';
  if(/リンプ|繝ｪ繝ｳ繝/.test(txt))return lead+': '+(src.hands||0)+'ハンド / リンプ機会'+(src.limpOpp||0);
  if(/入口|VPIP|参加|フロップ前|蜈･蜿｣|蜿ょ刈/.test(txt))return lead+': '+(src.hands||0)+'ハンド';
  if(/ポストフロップ|フロップ|ターン|PostF|繝昴せ繝医ヵ繝ｭ/.test(txt))return lead+': '+(src.hands||0)+'ハンド / PostF '+(src.poCount||0)+'回';
  if(/リバー|ワンペア|ショーダウン|WTSD|繝ｪ繝舌|繝ｯ繝ｳ/.test(txt))return lead+': '+(src.hands||0)+'ハンド / WTSD機会'+(src.wtsdSaw||0);
  if(/ミス|繝溘せ/.test(txt))return lead+': '+(src.hands||0)+'ハンド / 判断'+(src.totalDec||0)+'回';
  return lead+': '+(src.hands||0)+'ハンド';
}
function renderSessionFocusProgress(focus,stats){
  if(!focus)return '';
  const p=sessionFocusProgress(focus,stats);
  const cls='session-progress-'+(p.state||'pending');
  const sample=sessionFocusProgressSample(focus,stats);
  return '<div class="session-progress '+cls+'"><span>'+sessionTextHTML(p.label)+'</span>'+sessionTextHTML(p.text)+'<small>'+sessionTextHTML(sample)+'</small></div>';
}
function renderSessionCarryOver(focus){
  if(!focus)return '';
  const color=focus.tone==='good'?'var(--green)':focus.tone==='warn'?'var(--orange)':'var(--accent)';
  return '<div class="session-summary session-carryover" style="border-left-color:'+color+'"><div class="session-summary-title">前回からの引き継ぎ: '+sessionTextHTML(focus.title.replace(/^次回の一点:\s*/,''))+'</div><div class="session-summary-body">'+sessionTextHTML(focus.body)+'</div>'+renderSessionFocusProgress(focus)+renderSessionFocusActionChecklist(focus)+renderSessionPracticeRecommendation(focus)+'</div>';
}
function renderSessionStartChecklist(focus){
  const carry=renderSessionCarryOver(focus===undefined?getStoredSessionNextFocus():focus);
  return carry+renderSessionChecklist(SESSION_START_CHECKS,'全部にチェックできなくても開始はできます。崩れそうな条件を先に見つけるためのメモです。');
}
function sessionEndStatsProfile(stats){
  stats=stats||sessionStats||{};
  const n=stats.hands||0;
  const avg=function(arr){return arr&&arr.length?Math.round(arr.reduce(function(a,b){return a+b;},0)/arr.length):0;};
  const pct=function(a,b){return b>0?Math.round(a/b*100):-1;};
  const avgScore=avg(stats.scores||[]);
  const avgPF=avg(stats.pfScores||[]);
  const avgPO=avg(stats.poScores||[]);
  const poN=(stats.poScores||[]).length;
  const vpip=pct(stats.vpip||0,n);
  const limpPct=pct(stats.limp||0,stats.limpOpp||0);
  const wtsd=pct(stats.wtsdWent||0,stats.wtsdSaw||0);
  const mistake=pct(stats.badDec||0,stats.totalDec||0);
  let focus={title:'今日の振り返り',body:'まだハンド数が少ないため、数字よりも「集中して判断できたか」を見ます。次回のテーマを一つだけ決めて終えましょう。',tone:'neutral'};
  if(n>=5&&limpPct>25){
    focus={title:'次回の一点: オープンリンプを減らす',body:'リンプが多めです。参加するならレイズ、難しいハンドは最初からフォールドに整理すると、後のストリートがかなり楽になります。',tone:'warn'};
  }else if(n>=5&&vpip>45){
    focus={title:'次回の一点: 入口を締める',body:'VPIPが高めです。特にOOPやオフスートブロードウェイは、ヒットしても難しい判断になりやすいので参加前に一段絞ります。',tone:'warn'};
  }else if(n>=8&&poN>=4&&avgPF-avgPO>=18){
    focus={title:'次回の一点: ポストフロップで守る',body:'フロップ前よりポストフロップの失点が目立ちます。ワンペアで大きなポットを作る前に、相手レンジと嫌なターン/リバーを確認しましょう。',tone:'warn'};
  }else if(n>=8&&wtsd>37){
    focus={title:'次回の一点: リバーで降りる力',body:'ショーダウン到達が多めです。ライブ$2/$5では大きなリバーベットがバリュー寄りになりやすいので、ワンペアの受けを少し締めます。',tone:'warn'};
  }else if(n>=8&&mistake>30){
    focus={title:'次回の一点: 大きなミスを一つ減らす',body:'ミス率が高めです。全部を直すより、今日一番大きかった判断だけを次回のテーマにすると改善が続きます。',tone:'warn'};
  }else if(n>=8&&avgScore>=80){
    focus={title:'良いセッションです',body:'平均スコアは安定しています。次は得意な場面を増やすより、苦手な一領域を選んで精度を上げる段階です。',tone:'good'};
  }
  return sessionFocusApplyHistory({hands:n,avgScore,avgPF,avgPO,poN,vpip,limpPct,wtsd,mistake,focus});
}
function sessionEndFocusReason(profile){
  const p=profile||sessionEndStatsProfile();
  if(p.historyRepeat&&p.historyRepeat.title)return '同じテーマが'+p.historyRepeat.count+'回続いています。いまは新しい課題へ広げるより、'+p.historyRepeat.title+'をもう一度だけ継続する判断です。';
  const txt=((p.focus&&p.focus.title)||'')+' '+((p.focus&&p.focus.body)||'');
  if(/繝ｪ繝ｳ繝|リンプ/.test(txt))return 'リンプ率 '+(p.limpPct>=0?p.limpPct+'%':'--')+'。参加するならレイズかフォールドに寄せるテーマです。';
  if(/VPIP|蜈･蜿｣|蜿ょ刈|入口|参加/.test(txt))return 'VPIP '+(p.vpip>=0?p.vpip+'%':'--')+'。参加ハンドを一段絞るテーマです。';
  if(/PostF|繝昴せ繝医ヵ繝ｭ|ポストフロップ|フロップ|ターン/.test(txt))return 'PF '+(p.avgPF||'--')+'pt / PostF '+(p.poN?p.avgPO+'pt':'--')+'。フロップ以降の失点を減らすテーマです。';
  if(/WTSD|繝ｪ繝舌|繝ｯ繝ｳ|リバー|ワンペア|ショーダウン/.test(txt))return 'WTSD '+(p.wtsd>=0?p.wtsd+'%':'--')+'。リバーでショーダウンへ行きすぎない練習です。';
  if(/繝溘せ|ミス/.test(txt))return 'ミス率 '+(p.mistake>=0?p.mistake+'%':'--')+'。一番大きい判断ミスを減らすテーマです。';
  if((p.avgScore||0)>=80)return '平均 '+(p.avgScore||'--')+'pt。次は弱点探しより精度維持を狙います。';
  return (p.hands||0)+'ハンド。サンプルを増やして次回テーマを絞ります。';
}
function sessionEndPositiveNote(profile){
  const p=profile||sessionEndStatsProfile();
  if((p.avgScore||0)>=80)return 'よかった点: 平均'+p.avgScore+'pt。全体の判断精度は安定しています。';
  if((p.poN||0)>=4&&(p.avgPO||0)>=70)return 'よかった点: PostF '+p.avgPO+'pt。フロップ以降の判断は形になっています。';
  if((p.avgPF||0)>=75)return 'よかった点: PF '+p.avgPF+'pt。フロップ前の入口は大きく崩れていません。';
  if((p.wtsd||-1)>=20&&(p.wtsd||-1)<=34)return 'よかった点: WTSD '+p.wtsd+'%。ショーダウンへ行く量は自然な範囲です。';
  if((p.limpPct||0)<=10&&(p.hands||0)>=5)return 'よかった点: リンプはかなり抑えられています。入口整理は続いています。';
  return 'よかった点: 今日のデータが次の練習テーマを選ぶ材料になりました。';
}
function sessionEndCarryoverProgress(focus,stats){
  stats=stats||sessionStats||{};
  const base=sessionFocusProgress(focus,stats);
  if(base&&base.state&&base.state!=='pending')return base;
  const txt=((focus&&focus.title)||'')+' '+((focus&&focus.body)||'');
  if(!/WTSD|リバー|ワンペア|ショーダウン/.test(txt))return base;
  const delta=sessionStatsSinceBaseline(stats,focus&&focus.baseline);
  const src=delta||{wtsdSaw:stats.wtsdSaw||0,wtsdWent:stats.wtsdWent||0};
  const wtsd=src.wtsdSaw>0?Math.round(src.wtsdWent/src.wtsdSaw*100):-1;
  const prefix=delta?'前回テーマ後は':'今回は';
  if(src.wtsdSaw<5)return{state:'pending',label:'データ待ち',text:'リバー判断のサンプルがまだ少ないので、もう数ハンド見ます。'};
  if(wtsd>=20&&wtsd<=34)return{state:'good',label:'改善中',text:prefix+'WTSD '+wtsd+'%。ショーダウンへ行きすぎない形に近づいています。'};
  if(wtsd<=40)return{state:'improving',label:'あと少し',text:prefix+'WTSD '+wtsd+'%。かなり締まっていますが、完成ボードのワンペア受けはもう一段見ます。'};
  return{state:'warn',label:'継続課題',text:prefix+'WTSD '+wtsd+'%。まだリバーで受けすぎる可能性があります。'};
}
function sessionEndCarryoverResult(focus,stats){
  if(!focus)return '';
  const p=sessionEndCarryoverProgress(focus,stats||sessionStats);
  const sample=sessionFocusProgressSample(focus,stats||sessionStats);
  const label=p.state==='good'?'今回テーマ: 達成':p.state==='improving'?'今回テーマ: もう少し':p.state==='warn'?'今回テーマ: 継続':'今回テーマ: 判定待ち';
  return '<div class="session-focus-result session-focus-result-'+(p.state||'pending')+'"><b>'+sessionTextHTML(label)+'</b><span>'+sessionTextHTML(p.text)+'</span><small>'+sessionTextHTML(sample)+'</small></div>';
}
function sessionFocusClosingNote(focus,stats){
  if(!focus)return '';
  const p=sessionEndCarryoverProgress(focus,stats||sessionStats);
  const title=sessionFocusTitleText(focus);
  if(p.state==='good')return title+'はかなり守れました。次回は同じ型を軽く確認して、別の弱点へ広げてもよい段階です。';
  if(p.state==='improving')return title+'は前より良くなっています。あと数ハンドだけ同じ見方で反復すると、かなり自分の感覚になります。';
  if(p.state==='warn')return title+'はまだ残っています。次回も新しい課題へ散らさず、この一点だけを最初の数ハンドで確認しましょう。';
  return title+'はまだ判断材料が少なめです。次回はまず同じ場面を増やして、良し悪しを見える形にします。';
}
function renderSessionFocusClosingNote(focus,stats){
  const txt=sessionFocusClosingNote(focus,stats);
  if(!txt)return '';
  return '<div class="session-closing-note">'+sessionTextHTML(txt)+'</div>';
}
function sessionFocusHistoryEntry(focus,stats){
  if(!focus)return null;
  const p=sessionEndCarryoverProgress(focus,stats||sessionStats);
  return{
    title:sessionFocusTitleText(focus),
    state:p.state||'pending',
    text:p.text||'',
    sample:sessionFocusProgressSample(focus,stats||sessionStats),
    at:new Date().toISOString()
  };
}
function appendSessionFocusHistory(focus,stats){
  const entry=sessionFocusHistoryEntry(focus,stats||sessionStats);
  if(!entry||!entry.title)return null;
  const list=getSessionFocusHistory().slice();
  if(list.length&&list[0].title===entry.title&&list[0].sample===entry.sample)list[0]=entry;
  else list.unshift(entry);
  storeSessionFocusHistory(list);
  return entry;
}
function sessionFocusGrowthSummary(list){
  const items=(Array.isArray(list)?list:getSessionFocusHistory()).filter(function(it){return it&&it.title;}).slice(0,5);
  if(!items.length)return '';
  const recent=items[0];
  const good=items.filter(function(it){return it.state==='good';}).length;
  const warn=items.filter(function(it){return it.state==='warn';}).length;
  const same=items.filter(function(it){return it.title===recent.title;}).length;
  if(recent.state==='good'&&items[1]&&items[1].state==='warn'&&items[1].title===recent.title)return recent.title+'は前回の継続課題から達成まで戻せています。この修正はかなり良い流れです。';
  if(recent.state==='good')return recent.title+'は達成寄りです。直近'+items.length+'回で達成が'+good+'回あり、次は確認しながら別テーマへ広げられます。';
  if(same>=2&&recent.state==='warn')return recent.title+'が続いています。新しい課題を増やすより、この一点をもう一度だけ集中的に見ます。';
  if(warn>=3)return '直近は継続課題が多めです。全部を直そうとせず、次回は一番大きいテーマを一つだけ選ぶのが良さそうです。';
  if(recent.state==='improving')return recent.title+'は改善途中です。あと少し同じ見方で反復すると、判断がかなり安定します。';
  return 'テーマ履歴がたまり始めています。達成と継続の流れを見ながら、次回の一点を絞っていきます。';
}
function renderSessionFocusHistory(list){
  const items=(Array.isArray(list)?list:getSessionFocusHistory()).slice(0,3);
  if(!items.length)return '';
  const label=function(st){return st==='good'?'達成':st==='improving'?'もう少し':st==='warn'?'継続':'判定待ち';};
  const growth=sessionFocusGrowthSummary(Array.isArray(list)?list:getSessionFocusHistory());
  return '<div class="session-history"><div class="session-history-title">成長ログ</div>'+(growth?'<div class="session-growth-summary">'+sessionTextHTML(growth)+'</div>':'')+items.map(function(it){
    const st=it.state||'pending';
    return '<div class="session-history-item session-history-'+st+'"><b>'+sessionTextHTML(label(st))+'</b><span>'+sessionTextHTML(it.title)+'</span><small>'+sessionTextHTML(it.sample||it.text||'')+'</small></div>';
  }).join('')+'</div>';
}
function renderSessionEndSummary(stats,carryFocus){
  const p=sessionEndStatsProfile(stats);
  const carry=carryFocus===undefined?getStoredSessionNextFocus():carryFocus;
  const color=p.focus.tone==='good'?'var(--green)':p.focus.tone==='warn'?'var(--orange)':'var(--accent)';
  const score=p.hands>0
    ? '<div class="session-summary-grid"><div><b>'+p.hands+'</b><span>Hands</span></div><div><b>'+(p.avgScore||'--')+'</b><span>Avg</span></div><div><b>'+(p.avgPF||'--')+'</b><span>PF</span></div><div><b>'+(p.poN?p.avgPO:'--')+'</b><span>PostF</span></div></div>'
    : '<div class="session-check-note">まだハンドがないので、終了前の自己確認だけ表示します。</div>';
  return '<div class="session-summary" style="border-left-color:'+color+'"><div class="session-summary-title">'+p.focus.title+'</div><div class="session-summary-body">'+p.focus.body+'</div>'+renderSessionFocusClosingNote(carry,stats)+sessionEndCarryoverResult(carry,stats)+renderSessionFocusActionResult(carry,stats)+'<div class="session-focus-good">'+sessionTextHTML(sessionEndPositiveNote(p))+'</div><div class="session-focus-reason">'+sessionTextHTML(sessionEndFocusReason(p))+'</div>'+score+'</div>'+renderSessionFocusHistory();
}
function renderSessionEndChecklist(carryFocus){
  return renderSessionEndSummary(undefined,carryFocus)+renderSessionChecklist(SESSION_END_CHECKS,'点数よりも、次回に一つ直せる形で終えることを優先します。');
}
function initSessionChecklistUI(){
  const cb=$('cfg-session-check');
  const box=$('session-start-check');
  if(!cb||!box)return;
  cb.checked=sessionChecklistEnabled();
  box.innerHTML=cb.checked?renderSessionStartChecklist():'';
  refreshAppliedPracticeNote();
  cb.addEventListener('change',function(){
    setSessionChecklistEnabled(cb.checked);
    box.innerHTML=cb.checked?renderSessionStartChecklist():'';
    refreshAppliedPracticeNote();
  });
}
function refreshSessionStartChecklist(){
  const cb=$('cfg-session-check');
  const box=$('session-start-check');
  if(cb&&box)box.innerHTML=cb.checked?renderSessionStartChecklist():'';
  refreshAppliedPracticeNote();
}
function applySessionPracticeRecommendation(rec){
  if(!rec)return false;
  const mode=rec.modeValue||rec.mode||'normal';
  const modeEl=$('cfg-mode');
  if(!modeEl)return false;
  modeEl.value=mode;
  if(mode==='tournament'){
    const presetEl=$('cfg-tournament-preset');
    const focusEl=$('cfg-tournament-focus');
    if(presetEl&&rec.presetValue)presetEl.value=rec.presetValue;
    if(focusEl&&rec.focusValue)focusEl.value=rec.focusValue;
  }
  applyTournamentPresetToSetup();
  storeAppliedPractice(rec);
  refreshSessionStartChecklist();
  if(typeof toast==='function')toast('おすすめ練習を設定しました。内容を確認して開始してください。','info',2600);
  return true;
}
function finishSessionToSetup(){
  if(aiTimeout)clearTimeout(aiTimeout);game=null;
  _scenarioMode=false;
  const el=document.getElementById('scenario-banner');if(el)el.style.display='none';
  const hudTitle=document.querySelector('#hud .hud-title');
  if(hudTitle)hudTitle.textContent='🐟 Fish Tank Poker';
  showScreen('setup-screen');
  refreshSessionStartChecklist();
}
function openSessionEndChecklist(){
  const modal=$('session-end-modal');
  const content=$('session-end-content');
  if(!modal||!content)return false;
  const carry=getStoredSessionNextFocus();
  if(carry)appendSessionFocusHistory(carry,sessionStats);
  content.innerHTML=renderSessionEndChecklist(carry);
  storeSessionNextFocus(sessionEndStatsProfile().focus);
  modal.classList.add('open');
  return true;
}

function selectLesson(decisions,hr){
  const tags=new Set();
  if((hr.numActive||0)>2)tags.add('multiway');
  for(const d of decisions){
    if(d.potOdds>0)tags.add('potodds'),tags.add('equity');
    if(d.action==='fold'&&d.street==='preflop')tags.add('preflop'),tags.add('fold');
    if(d.action==='fold')tags.add('fold');
    if(d.action==='call')tags.add('call'),tags.add('potodds');
    if(d.action==='raise'&&d.street==='preflop')tags.add('preflop'),tags.add('3bet');
    if(d.action==='raise'&&d.street!=='preflop')tags.add('value'),tags.add('sizing');
    if(d.action==='allin')tags.add('allin'),tags.add('spr');
    if(d.street==='flop')tags.add('flop'),tags.add('cbet');
  }
  const pool=GTO_TIPS.filter(t=>t.tags.some(tg=>tags.has(tg)));
  return (pool.length?pool:GTO_TIPS)[Math.floor(Math.random()*(pool.length||GTO_TIPS.length))];
}

// ---- ANALYSIS ----
// ===== GTO採点エンジン v4 - EV損失ベース =====

// ストリート重み: プリフロップは全ストリートに波及、リバーはEV確定
// FISH_TANK_GTO_POSTFLOP_PROFILES_MODULE
function beforeStreetAggressionCount(hr,d,forHero){
  const idx=streetDecisionIndex(hr,d);
  const before=idx>=0?hr.decisions.slice(0,idx):hr.decisions;
  const streets={flop:1,turn:2,river:3};
  const cur=streets[d.street]||0;
  const set=new Set();
  before.forEach(function(x){
    if(x.street==='preflop'||(streets[x.street]||0)>cur)return;
    if(!!x.isHuman!==!!forHero&&(x.action==='bet'||x.action==='raise'||x.action==='allin'))set.add(x.street);
  });
  return set.size;
}

// [Codex fix 2026-06-21] ボード別に、PFR側/受け側のレンジ優位とナッツ優位を細かく分ける。
function boardRangeNutOwnerProfile(profile,role,opts){
  opts=opts||{}; role=role||{};
  const pfrOwner=opts.isPfr?'hero':'villain';
  const callerOwner=opts.isPfr?'villain':'hero';
  const isNut=!!(role.isNut||role.role==='nutted');
  let rangeOwner='neutral';
  let nutOwner='neutral';
  const reasons=[];
  if(!profile)return{rangeOwner,nutOwner,reasons};
  if(profile.primary==='a_high_dry'||profile.primary==='k_high_dry'||profile.primary==='q_high_dry'){
    rangeOwner=pfrOwner; nutOwner=pfrOwner;
    reasons.push('高いカードのドライボードは、オープン/3BET側の強いAx・Kx・オーバーペアが多く残ります。');
  }else if(profile.primary==='paired'||profile.primary==='trips_board'){
    if(profile.pairClass==='high_pair'){
      rangeOwner=pfrOwner; nutOwner=pfrOwner;
      reasons.push('高いペアボードはPFR側に強いトップカード/オーバーペア由来のトリップス候補が残りやすいです。');
    }else if(profile.pairClass==='middle_pair'){
      rangeOwner='neutral'; nutOwner='neutral';
      reasons.push('中位ペアボードは双方にトリップス候補が残り、レンジ全体よりキッカーとラインを見ます。');
    }else{
      rangeOwner='neutral'; nutOwner=callerOwner;
      reasons.push('低いペアボードは受け側の小ペア・スーテッド系にトリップス/フルハウス候補が増えます。');
    }
    if(profile.primary==='trips_board'&&profile.pairClass!=='high_pair'){
      rangeOwner='neutral'; nutOwner=callerOwner;
      reasons.push('トリップスボードは全体レンジ差より、誰がポケットペア/強キッカーを持つかが重要です。');
    }
  }else if(profile.primary==='monotone'||profile.primary==='four_flush'){
    if(profile.broadway>=1||profile.topRank>=12)rangeOwner=pfrOwner;
    else rangeOwner='neutral';
    nutOwner=isNut?'hero':(profile.low?callerOwner:'neutral');
    reasons.push('同色が多いボードはレンジ全体より、Aハイフラッシュ/ブロッカーと低い同色コネクターの有無を見ます。');
  }else if(profile.primary==='low_connected'||profile.primary==='wet_connected'||profile.primary==='straight_complete'){
    rangeOwner='neutral'; nutOwner=callerOwner;
    reasons.push('低い連結ボードは、受け側のセット・ツーペア・ストレート絡みが増えます。');
  }else if(profile.primary==='broadway_connected'){
    rangeOwner=pfrOwner; nutOwner='neutral';
    reasons.push('ブロードウェイ連結はPFR側の高カード密度が残る一方、受け側のスーテッドブロードウェイも強く絡みます。');
  }else if(profile.primary==='two_tone'){
    rangeOwner=pfrOwner; nutOwner='neutral';
    reasons.push('2トーンはPFR側が小さく打ちやすい一方、受け側のドロー継続も残ります。');
  }else if(profile.primary==='low_dry'){
    rangeOwner='neutral'; nutOwner=callerOwner;
    reasons.push('低いドライボードはPFRのレンジ優位が薄まり、受け側の小ペア/セットが残ります。');
  }
  if(profile.transition==='overcard'){
    rangeOwner=pfrOwner;
    reasons.push('オーバーカードはPFR側のレンジに当たりやすい変化です。');
  }else if(profile.transition==='board_pair'){
    if(profile.pairClass==='high_pair'){rangeOwner=pfrOwner;nutOwner=pfrOwner;}
    else nutOwner=callerOwner;
    reasons.push('ボードペア化でフルハウス/トリップスの比重が上がります。');
  }else if(profile.transition==='flush_complete_card'||profile.transition==='four_flush_card'){
    nutOwner=isNut?'hero':'neutral';
    reasons.push('フラッシュ完成カードでは、非ナッツのワンペアやエアの価値が落ちます。');
  }else if(profile.transition==='straight_complete_card'){
    nutOwner=callerOwner;
    reasons.push('ストレート完成カードでは、受け側の連結ハンドが強くなります。');
  }
  if(isNut)nutOwner='hero';
  return{rangeOwner,nutOwner,reasons};
}
function rangeNutAdvantageProfile(hr,d,profile,role,opts){
  if(!hr||!d||!profile||d.street==='preflop')return null;
  opts=opts||{};
  role=role||{};
  const lane=d.action==='check'?'check':d.action==='call'?'call':(d.action==='bet'||d.action==='raise'||d.action==='allin')?'bet':d.action;
  const pot=Math.max(1,d.pot||1);
  const basePot=d.toCall>0?Math.max(1,pot-(d.toCall||0)):pot;
  const sizePct=lane==='call'?Math.round((d.toCall||d.amount||0)/basePot*100):Math.round((d.amount||0)/pot*100);
  const isStrong=!!(role.isNut||role.role==='nutted'||role.role==='strong');
  const isNut=!!(role.isNut||role.role==='nutted');
  const hasGoodDraw=!!(role.draw&&role.draw.outs>=8&&d.street!=='river');
  const owners=boardRangeNutOwnerProfile(profile,role,opts);
  let rangeOwner=owners.rangeOwner;
  let nutOwner=owners.nutOwner;
  const reasons=(owners.reasons||[]).slice();
  function level(owner){
    if(owner==='hero')return'高';
    if(owner==='villain')return'低';
    return'中';
  }
  let verdict='normal',severity='normal',policy='レンジ優位とナッツ優位は拮抗気味です。手役とサイズを合わせて判断します。',suggest='';
  const heroRange=level(rangeOwner);
  const heroNut=level(nutOwner);
  if(lane==='bet'){
    if(rangeOwner==='hero'&&(sizePct<=50||isStrong||hasGoodDraw)){
      verdict='good';severity='good';
      policy='こちらにレンジ優位があるため、小〜中サイズで広く圧をかけやすい場面です。';
      suggest=sizePct>75&&!isNut?'推奨: 大きくしすぎず33〜50%中心':'推奨: 33〜50%の継続ベットを中心にする';
    }else if(rangeOwner==='villain'&&nutOwner==='villain'&&!isStrong&&!hasGoodDraw&&sizePct>=33){
      verdict=sizePct>=55?'bad':'border';severity=verdict;
      policy='相手側にレンジ優位とナッツ優位が寄っているため、弱い手で先に大きく打つと強い継続レンジに捕まりやすいです。';
      suggest=d.street==='river'?'推奨: チェック中心。打つなら強い完成役か、空振りを十分に含められるブラフに絞る':'推奨: チェック中心。打つなら強い完成役か強いドローに絞る';
    }else if(nutOwner==='villain'&&!isStrong&&sizePct>=60){
      verdict=role.role==='air'?'bad':'border';severity=verdict;
      policy='レンジ全体は戦えても、ナッツ優位が相手側にあるため大サイズは慎重に使います。';
      suggest='推奨: 小〜中サイズかチェック';
    }
  }else if(lane==='check'){
    if((rangeOwner==='villain'||nutOwner==='villain')&&!isNut){
      verdict='good';severity='good';
      policy='相手側のレンジ/ナッツ優位を尊重して、チェックでポットを管理する判断が自然です。';
    }else if(rangeOwner==='hero'&&nutOwner==='hero'&&isStrong){
      verdict='border';severity='border';
      policy='こちらにレンジ優位もナッツ優位もあるため、チェックだけで終えると取り逃しが出やすい場面です。';
      suggest='推奨: 小〜中サイズのバリューを混ぜる';
    }
  }else if(lane==='call'){
    if(nutOwner==='villain'&&!isStrong&&!hasGoodDraw&&sizePct>=45){
      verdict=sizePct>=65?'bad':'border';severity=verdict;
      policy='相手側にナッツ優位があるボードで大きく受けると、必要勝率以上に実現しにくいコールになります。';
      suggest='推奨: フォールド寄り。相手がブラフ過多なら一部コール';
    }else if(isStrong&&heroNut!=='低'){
      verdict='normal';severity='normal';
      policy='強い手役で受けていますが、相手のナッツ密度とサイズを確認してコール頻度を決めます。';
    }
  }else if(lane==='fold'){
    if(nutOwner==='villain'&&!isStrong){
      verdict='good';severity='good';
      policy='相手側にナッツ優位がある場面では、弱いショーダウンバリューを手放す判断も自然です。';
    }
  }
  return{street:d.street,lane,sizePct,rangeOwner,nutOwner,heroRangeAdv:heroRange,heroNutAdv:heroNut,verdict,severity,policy,suggest,reasons:reasons.slice(0,3)};
}
function rangeNutAdvantageProfileText(p){
  if(!p)return'';
  const lane={check:'チェック',call:'コール',bet:'ベット/レイズ',fold:'フォールド'}[p.lane]||p.lane;
  return 'レンジ優位='+p.heroRangeAdv+' / ナッツ優位='+p.heroNutAdv+' / '+lane+' / '+p.verdict+'：'+p.policy;
}

// [Codex fix 2026-06-16] 公開アクションから相手レンジを更新し、結果論ではなくライン密度で評価する。
function rangeActionUpdateProfile(hr,d,profile,role,opts){
  if(!hr||!d||d.street==='preflop')return null;
  opts=opts||{};
  role=role||{};
  const isRiver=d.street==='river';
  const idx=streetDecisionIndex(hr,d);
  const before=idx>=0?hr.decisions.slice(0,idx):hr.decisions;
  const streetOrder={flop:1,turn:2,river:3};
  const lane=d.action==='check'?'check':d.action==='call'?'call':(d.action==='bet'||d.action==='raise'||d.action==='allin')?'bet':d.action;
  const pot=Math.max(1,d.pot||1);
  const basePot=d.toCall>0?Math.max(1,pot-(d.toCall||0)):pot;
  const sizePct=lane==='call'?Math.round((d.toCall||d.amount||0)/basePot*100):Math.round((d.amount||0)/pot*100);
  const villainAgg=before.filter(function(x){return !x.isHuman&&x.street!=='preflop'&&(x.action==='bet'||x.action==='raise'||x.action==='allin');});
  const villainCalls=before.filter(function(x){return !x.isHuman&&x.street!=='preflop'&&x.action==='call';});
  const villainChecksThisStreet=before.filter(function(x){return !x.isHuman&&x.street===d.street&&x.action==='check';}).length;
  const heroAgg=before.filter(function(x){return x.isHuman&&x.street!=='preflop'&&(x.action==='bet'||x.action==='raise'||x.action==='allin');});
  const priorAggStreets=[...new Set(villainAgg.map(function(x){return x.street;}))].filter(function(s){return streetOrder[s]<=(streetOrder[d.street]||0);});
  const pressure=priorAggStreets.length;
  const lastVillainAction=[...before].reverse().find(function(x){return !x.isHuman&&x.street!=='preflop';})||null;
  const heroBetTurn=heroAgg.some(function(x){return x.street==='turn';});
  const villainCalledTurn=villainCalls.some(function(x){return x.street==='turn';});
  const villainCalledFlop=villainCalls.some(function(x){return x.street==='flop';});
  const cappedByCheck=villainChecksThisStreet>0&&!before.some(function(x){return !x.isHuman&&x.street===d.street&&(x.action==='bet'||x.action==='raise'||x.action==='allin');});
  const isOnePair=!!(role.pairTier&&role.role!=='strong'&&role.role!=='nutted');
  const strongOnePair=!!(role.pairTier&&(role.role==='strong'||role.role==='value'));
  const isStrong=!!(role.isNut||role.role==='nutted'||role.role==='strong');
  const hasGoodDraw=!!(role.draw&&role.draw.outs>=8&&d.street!=='river');
  const danger=!!(profile&&(profile.dynamic||profile.flushThreat||profile.straightThreat||profile.paired||profile.transition&&profile.transition!=='none'));
  const advText=String(opts.heroRangeAdv||'').toLowerCase();
  const heroRangeHigh=opts.heroRangeAdv==='high'||advText.indexOf('\u9ad8')>=0||advText.indexOf('\u9b2e')>=0||advText.indexOf('\u9b2f')>=0;
  let rangeState='unresolved';
  const updates=[];
  if(cappedByCheck){
    rangeState='capped';
    updates.push('相手のチェックで、相手のレンジから強いベット頻度の一部が減ります。');
  }
  if(pressure>=2){
    rangeState='pressure_dense';
    updates.push(isRiver?'相手が複数ストリートで圧力をかけており、リバーでは強いバリューと一部のブラフ候補に分かれます。':'相手が複数ストリートで圧力をかけており、強いバリューと強いドローが濃くなります。');
  }else if(pressure===1){
    rangeState=rangeState==='capped'?'mixed_capped_pressure':'single_pressure';
    updates.push(isRiver?'相手の一度目のリバーベットで、ペア以上のバリューと一部のブラフ候補を想定します。':'相手の一度目のベットで、エアだけでなくペア以上/強いドローが残ります。');
  }
  if(heroBetTurn&&villainCalledTurn&&d.street==='river'){
    rangeState='turn_call_dense';
    updates.push('ターンでこちらのベットにコールした相手は、リバーではペア以上の完成役や一部のミスドローのブラフ候補に分かれます。');
  }else if(villainCalledFlop&&d.street!=='flop'){
    updates.push(isRiver?'フロップコール後にリバーまで来ているので、相手には中程度の完成役と一部のミスドローが残ります。':'フロップコール後なので、相手には中程度の完成役とドローが残ります。');
  }
  // [Codex fix 2026-07-12] BLUEPRINT Phase 4: 公開ラインから相手レンジのバリュー密度とブラフ候補量を定量スナップショット化する。
  let valueDensityPct=24+pressure*16;
  let bluffCandidatePct=34-pressure*6;
  if(rangeState==='capped'){valueDensityPct-=8;bluffCandidatePct+=10;}
  if(rangeState==='mixed_capped_pressure'){valueDensityPct+=4;bluffCandidatePct+=4;}
  if(rangeState==='pressure_dense'){valueDensityPct+=12;bluffCandidatePct-=4;}
  if(rangeState==='turn_call_dense'){valueDensityPct+=16;bluffCandidatePct-=6;}
  if(villainCalledFlop){valueDensityPct+=5;bluffCandidatePct+=3;}
  if(villainCalledTurn){valueDensityPct+=8;bluffCandidatePct-=2;}
  if(danger){valueDensityPct+=8;bluffCandidatePct-=isRiver?5:1;}
  if(sizePct>=65){valueDensityPct+=8;bluffCandidatePct-=4;}
  else if(sizePct<=35&&lane==='call'){valueDensityPct-=4;bluffCandidatePct+=4;}
  if(isRiver){valueDensityPct+=5;bluffCandidatePct-=3;}
  valueDensityPct=Math.max(5,Math.min(92,Math.round(valueDensityPct)));
  bluffCandidatePct=Math.max(4,Math.min(55,Math.round(bluffCandidatePct)));
  const rangeDensityBand=valueDensityPct>=70?'高':valueDensityPct>=50?'中高':valueDensityPct>=35?'中':'低';
  const bluffDensityBand=bluffCandidatePct>=34?'多め':bluffCandidatePct>=22?'中':'少なめ';
  if(valueDensityPct>=65)updates.push('公開ライン上、相手のバリュー密度は高めに更新されます（約'+valueDensityPct+'%）。');
  else if(valueDensityPct<=32)updates.push('相手レンジはまだ広く、バリュー密度は低めです（約'+valueDensityPct+'%）。');
  let verdict='normal',severity='normal',policy='相手レンジはまだ広く、ボードとサイズを合わせて更新します。',suggest='';
  if(lane==='call'){
    if((valueDensityPct>=62||rangeState==='pressure_dense'||rangeState==='turn_call_dense')&&!isStrong&&!strongOnePair&&!hasGoodDraw&&sizePct>=45){
      verdict=sizePct>=65||d.street==='river'?'bad':'border';severity=verdict;
      policy='相手レンジが強いバリュー寄りに更新されているため、ワンペア以下の大きいコールは見た目のEQより苦しくなります。';
      suggest='推奨: フォールド寄り。ブラフ過多の相手にだけ一部コール';
    }else if(strongOnePair&&valueDensityPct>=58&&sizePct>=50){
      verdict='border';severity='border';
      policy='強いワンペアでも、複数ストリートの圧力後は明確コールではなくブラフキャッチ寄りです。';
      suggest='推奨: 相手のブラフ頻度次第。パッシブ相手には頻度を落とす';
    }
  }else if(lane==='bet'){
    if(cappedByCheck&&(isStrong||hasGoodDraw||heroRangeHigh)&&sizePct<=55){
      verdict='good';severity='good';
      policy='相手のチェックでレンジがややキャップされたため、小〜中サイズのベットでフォールド/バリューを作りやすい場面です。';
      suggest='推奨: 33〜50%のベットを中心にする';
    }else if((rangeState==='turn_call_dense'||rangeState==='pressure_dense')&&isOnePair&&sizePct>=55){
      verdict='border';severity='border';
      policy='相手が前ストリートで強く継続しており、ワンペアの大きいバリューは薄くなります。';
      suggest='推奨: チェックまたは小〜中サイズ';
    }else if(danger&&role.role==='air'&&sizePct>=55&&rangeState!=='capped'){
      verdict='border';severity='border';
      policy='相手レンジが十分にキャップされていない重いボードでは、大きいブラフの成功率が落ちます。';
      suggest='推奨: ブロッカーが強い時だけ混ぜる';
    }
  }else if(lane==='check'){
    if((rangeState==='pressure_dense'||rangeState==='turn_call_dense')&&!isStrong){
      verdict='good';severity='good';
      policy='相手レンジが強く更新されているため、無理にポットを膨らませないチェックが自然です。';
    }
  }else if(lane==='fold'){
    if((rangeState==='pressure_dense'||rangeState==='turn_call_dense')&&!isStrong){
      verdict='good';severity='good';
      policy='相手のラインが強く更新されているため、弱いショーダウンバリューを降ろす判断は自然です。';
    }
  }
  if(!updates.length)updates.push('この時点では相手レンジの大きな絞り込みはまだ少ないです。');
  return{street:d.street,lane,sizePct,rangeState,pressure,valueDensityPct,bluffCandidatePct,rangeDensityBand,bluffDensityBand,priorAggStreets,lastVillainAction:lastVillainAction?lastVillainAction.action:'',cappedByCheck,heroBetTurn,villainCalledTurn,verdict,severity,policy,suggest,updates:updates.slice(0,4)};
}
function rangeActionUpdateProfileText(p){
  if(!p)return'';
  const lane={check:'チェック',call:'コール',bet:'ベット/レイズ',fold:'フォールド'}[p.lane]||p.lane;
  return '相手レンジ更新='+p.rangeState+' / バリュー密度='+p.rangeDensityBand+'('+p.valueDensityPct+'%) / ブラフ候補='+p.bluffDensityBand+'('+p.bluffCandidatePct+'%) / '+lane+' / '+p.verdict+'：'+p.policy;
}

function playerDraw(holeCards,comm){
  if(!holeCards||holeCards.length<2||comm.length<3)return{flush:false,straight:false,oesd:false,gutshot:false,outs:0};
  // フラッシュドロー: ホールカードが含む4枚フラッシュ（完成していない）
  const all=[...holeCards,...comm];
  const sc={};all.forEach(c=>sc[c.suit]=(sc[c.suit]||0)+1);
  let flushDraw=false;
  for(const hc of holeCards){
    if((sc[hc.suit]||0)===4&&comm.filter(c=>c.suit===hc.suit).length>=2)flushDraw=true;
  }
  // ストレートドロー: OESD(8アウト)/ガットショット(4アウト)
  const vals=[...new Set(all.map(c=>RANK_VAL[c.rank]))].sort((a,b)=>a-b);
  if(vals.includes(14))vals.unshift(1); // Ace-low wheel draw - must prepend, not append
  const holeVals=new Set(holeCards.map(c=>RANK_VAL[c.rank]));
  let oesd=false,gutshot=false;
  for(let i=0;i<vals.length-3;i++){
    const w=vals.slice(i,i+4);
    if(w[3]-w[0]<=4&&new Set(w).size===4){
      if(![...w].some(v=>holeVals.has(v)))continue;
      if(w[3]-w[0]===3)oesd=true;
      else gutshot=true;
    }
  }
  const outs=Math.min(15,(flushDraw?9:0)+(oesd?8:gutshot?4:0));
  return{flush:flushDraw,straight:oesd||gutshot,oesd,gutshot,outs};
}

// [Codex fix 2026-05-26] ワンペアなどのメイドハンドにも付随ドローを持たせ、ミドルペア+OESDを見落とさない。
function madeDrawInfo(holeCards,comm){
  if(!holeCards||!comm||comm.length>=5)return{draw:null,note:'',dynamic:false};
  const draw=playerDraw(holeCards,comm);
  if(!draw||!draw.outs)return{draw:null,note:'',dynamic:false};
  let label='';
  if(draw.flush&&draw.straight)label='コンボドロー（約'+draw.outs+'アウト）';
  else if(draw.flush)label='フラッシュドロー（9アウト）';
  else if(draw.oesd)label='OESD（8アウト）';
  else if(draw.gutshot)label='ガットショット（4アウト）';
  return{draw,note:label?' '+label+'もあります。':'',dynamic:true};
}

// ハンド役割分析（レンジ内相対強度ベース）
function handRole(holeCards,comm,evalResult){
  if(!evalResult||!holeCards||holeCards.length<2)return{role:'unknown',note:'',isNut:false,isVuln:false};
  const cat=evalResult.cat;
  const tex=boardTex(comm);
  const r1=RANK_VAL[holeCards[0].rank]||0,r2=RANK_VAL[holeCards[1].rank]||0;
  const hi=Math.max(r1,r2),lo=Math.min(r1,r2);
  const boardRanks=comm.map(c=>RANK_VAL[c.rank]||0).sort((a,b)=>b-a);

  if(cat===0){
    // リバー（comm.length>=5）ではドローは決着済み → cat=0はドロー失敗（air）
    if(comm.length>=5){
      return{role:'air',note:'ハイカード（ドロー失敗）。ショーダウンバリューなし。ブラフかチェックが基本。',isNut:false,isVuln:false};
    }
    const draw=playerDraw(holeCards,comm);
    if(draw.flush&&draw.straight)return{role:'draw',note:'コンボドロー（フラッシュ＋ストレート、約'+draw.outs+'アウト）。非常に強いセミブラフ。積極的にベット推奨。Dynamic equity高：ターン/リバーで大幅改善可能。',isNut:false,isVuln:false,draw,sdv:false,dynamic:true};
    if(draw.flush)return{role:'draw',note:'フラッシュドロー（9アウト）。セミブラフとしてベットが有効。ヒット率約35%。SDVは低いが将来改善率（Turnability）が高い。',isNut:false,isVuln:false,draw,sdv:false,dynamic:true};
    if(draw.oesd)return{role:'draw',note:'OESD（8アウト）。強いセミブラフ。ベットで2つの勝ち筋。動的エクイティが高くリバーでの改善が見込める。',isNut:false,isVuln:false,draw,sdv:false,dynamic:true};
    if(draw.gutshot)return{role:'draw',note:'ガットショット（4アウト）。弱めのドロー。SDV低くチェック/フォールドが基本。',isNut:false,isVuln:false,draw,sdv:false,dynamic:true};
    return{role:'air',note:'ハイカード。SDV（ショーダウンバリュー）なし。ブラフ適性あり。フォールドも有力。',isNut:false,isVuln:false,sdv:false,dynamic:false};
  }

  if(cat===1){// ワンペア
    const pairRank=holeCards.find(c=>comm.some(b=>b.rank===c.rank))?.rank;
    const pairVal=pairRank?RANK_VAL[pairRank]:0;
    const madeDraw=madeDrawInfo(holeCards,comm);
    // ボードペア判定: ホールカードがペアに貢献していない（ボードのペアを使用中）
    if(!pairRank){
      const boardHasPair=Object.values(Object.fromEntries(comm.map(c=>[c.rank,comm.filter(b=>b.rank===c.rank).length]))).some(v=>v>=2);
      if(boardHasPair){
        const kick=Math.max(r1,r2);
        const isAhigh=kick>=14,isKhigh=kick>=13;
        const kickRole=isAhigh?'strong':'air';
        const kickNote=isAhigh?'A-high。ショーダウン価値あり。ブラフキャッチ・SDV役割が主。':
                      isKhigh?'K-high。ショーダウン価値は限定的。':
                      'ハイカード。ショーダウン価値なし。';
        // [Claude fix 2026-06-09] isOvercard: ホールカードの最大値がボードペアのランク(boardRanks[0])を上回るか。
        // KJ on 774 → K(13) > 7 → isOvercard=true。この場合ワンペア管理ではなくオーバーカードCB局面として扱う。
        const isOvercard=kick>boardRanks[0];
        const overcardNote=isOvercard?'ペアドボードでのオーバーカード。PFRならレンジCBが推奨（25〜40%pot）。':'';
        return{role:kickRole,note:'ボードペア（ホールカードはキッカーのみ）。'+kickNote+(overcardNote?' '+overcardNote:'')+'バリューベットは難しく、ポットコントロールまたはブラフキャッチが基本。'+madeDraw.note,isNut:false,isVuln:true,pairTier:'board_pair',kicker:kick,isOvercard,draw:madeDraw.draw,dynamic:madeDraw.dynamic};
      }
    }
    const isTop=pairVal===boardRanks[0];
    const isOver=hi>boardRanks[0]&&r1===r2; // pocket over pair
    const uniqBoard=[...new Set(boardRanks)];
    const pairIdx=uniqBoard.indexOf(pairVal);
    const pairTier=isOver?'overpair':isTop?'top_pair':pairIdx===1?'second_pair':pairIdx>=2&&pairIdx===uniqBoard.length-1?'bottom_pair':pairIdx>=2?'low_pair':'under_pair';
    const kick=isTop?(hi===pairVal?lo:hi):0;
    const vuln=tex.flushDraw||tex.straightDraw||tex.twoTone;
    let note='';
    if(isOver)note='オーバーペア。強いバリューハンド。積極的にベット推奨。';
    else if(isTop&&kick>=12)note='トップペア強キッカー（'+(RANK_JP[holeCards.find(c=>RANK_VAL[c.rank]!==pairVal)?.rank]||'')+'）。バリューベット優先。';
    else if(isTop&&kick>=10)note='トップペア中キッカー。バリューベット可。中サイズ推奨。';
    else if(isTop)note='トップペア弱キッカー。中サイズのバリューを取りながらポットコントロールを意識。レンジ内では中位ハンド。';
    else note='中・低ペア。レンジ内では弱め。主にcheck-call戦略。';
    if(comm.length>=5&&isTop&&tex.flushy>=4){
      note='トップペアですが、4枚同色ボードではバリューはかなり薄くなります。チェックでショーダウン価値を守るのが基本です。';
    }else if(vuln&&isTop){
      note+=(tex.twoTone&&!tex.flushDraw?' 同色ターン注意。':'')+(tex.flushDraw?' フラッシュドロー注意。':'')+( tex.straightDraw?' ストレートドロー注意。':'');
    }
    const role=isOver?'strong':(isTop&&kick>=12?'strong':isTop&&kick>=10?'value':'medium');
    return{role,note:note+madeDraw.note,isNut:false,isVuln:vuln,sdv:true,dynamic:madeDraw.dynamic,draw:madeDraw.draw,pairTier,kicker:kick,pairRank:pairVal};
  }

  if(cat===2){// ツーペア
    // [fix 2026-06-10] cat===2ブロックでmadeDrawが未定義のままmadeDraw.noteを参照していた
    // (ポケットペア×ペアボードでReferenceError→analyzeHandがクラッシュ)。ここで定義する。
    const madeDraw=madeDrawInfo(holeCards,comm);
    const myRanks=[r1,r2];
    const isTopTwo=myRanks.every(r=>boardRanks.slice(0,2).includes(r))||
                   myRanks.some(r=>boardRanks[0]===r)&&myRanks.some(r=>boardRanks[1]===r);
    const lowerPairRank=evalResult&&evalResult.co&&evalResult.co[1]?evalResult.co[1].v:0;
    const upperPairRank=evalResult&&evalResult.co&&evalResult.co[0]?evalResult.co[0].v:0;
    const isPocketPair=r1===r2;
    // [Claude fix 2026-06-07] ポケットペア+ボードペア: isBoardCompletedTPの対象外
    // 例: AA on 8-8-5 → AA+88のツーペア。ポケットペアは全員共有ではなくheroのアドバンテージ。
    // isBoardCompletedTPはKJ on KQ44等（ホールカード1枚+ボード1枚のペア+ボードペア）のみ対象。
    const isBoardCompletedTP=!isPocketPair&&lowerPairRank>0&&!myRanks.includes(lowerPairRank);
    const vuln=isBoardCompletedTP||tex.paired;
    let note;
    if(isPocketPair){
      // ポケットペア + ボードペア = ツーペア確定
      // ボードペアのランクを特定: 自分のポケットランクではない方
      const boardPairRk=r1===upperPairRank?lowerPairRank:upperPairRank;
      const pcktName=RANK_JP[holeCards[0].rank]||holeCards[0].rank;
      const bpName=['','','2','3','4','5','6','7','8','9','T','J','Q','K','A'][boardPairRk]||'?';
      if(r1>boardPairRk){
        // AA on 8-8-5 型: ポケットペアがボードペア上位 → エースアップ等の強いツーペア
        note='ポケット'+pcktName+pcktName+' + ボードペア('+bpName+')のツーペア。強いバリューハンド。積極的にベット推奨。';
        return{role:'strong',note:note+madeDraw.note,isNut:false,isVuln:tex.flushDraw||tex.straightDraw,madeClass:'two_pair',valueTier:'pocket_over_board_pair'};
      }else{
        // 55 on 8-8-3 型: ボードペアが上位 → 中程度のバリュー
        // [Codex fix 2026-06-25] 手役名はツーペアでも、実戦価値は下のポケットペア寄り。強いバリュー扱いにしない。
        note='ポケット'+pcktName+pcktName+'はありますが、ボードの'+bpName+'ペアが上位です。実戦上は下のペア寄りで、強く取り切る手ではありません。';
        return{role:'medium',note:note+madeDraw.note,isNut:false,isVuln:true,pairTier:'under_pair',madeClass:'two_pair',valueTier:'pocket_under_board_pair'};
      }
    }
    if(isBoardCompletedTP){
      // KJ on KQ44 型: 上位ペアは手札+ボード、下位ペアはボード完全依存 → 実質トップペア相当
      const lpName=['','','2','3','4','5','6','7','8','9','T','J','Q','K','A'][lowerPairRank]||'?';
      note='トップペア（ボード'+lpName+'ペア補完）。下位ペア('+lpName+')はボードで全員が共有しており、実際の優位性はトップペア相当。ポットコントロール中心。';
    }else{
      note='ツーペア'+(vuln?' ボードペアによるカウンターフィット（格下げ）リスクあり。check-call中心に。':' 強いバリューハンド。積極的にベット推奨。');
    }
    // [Claude fix 2026-06-10] isBoardCompletedTPはトップペア相当 → pairTier='top_pair'を明示。
    // これにより下流のstrongOnePairフラグが正しくtrueになり、turn/riverの誤'bad'判定を防ぐ。
    return{role:isBoardCompletedTP?'value':(isTopTwo?'strong':'value'),note,isNut:false,isVuln:vuln,pairTier:isBoardCompletedTP?'top_pair':undefined,madeClass:'two_pair',valueTier:isBoardCompletedTP?'board_completed_top_pair':(isTopTwo?'top_two_pair':'lower_two_pair')};
  }

  if(cat===3){// トリップス or セット
    // ---- セット判定: ポケットペア（ホールカードが同ランク）+ボード1枚が一致 ----
    const isSet=holeCards[0].rank===holeCards[1].rank&&comm.some(c=>c.rank===holeCards[0].rank);
    if(isSet){
      // セットはキッカー問題なし。フルハウスへのリドロー付きで非常に強力
      const setRank=RANK_JP[holeCards[0].rank]||holeCards[0].rank;
      const vuln=tex.flushDraw||tex.straightDraw;
      const note='セット（'+setRank+'のポケットペア）！非常に強いハンド。積極的にバリューを取りましょう。'+(vuln?' ドローへの課金とポット保護を兼ねてサイズを上げて打ちましょう。':'ドロー課金・ポット構築のため積極的なサイズが有効です。');
      return{role:'strong',note,isNut:false,isVuln:false};
    }
    // ---- ボードトリップス判定: ボード自体に同ランク3枚（7c7d7s等） ----
    // 全員がトリップスを「共有」しており、強さはキッカー勝負 + ポケットペア=FH優位
    const brcMap={};
    comm.forEach(function(c){brcMap[c.rank]=(brcMap[c.rank]||0)+1;});
    const boardTripEntry=Object.entries(brcMap).find(function(e){return e[1]>=3;});
    if(boardTripEntry){
      const btr=boardTripEntry[0]; // 例: '7'
      const myKickers=holeCards.filter(function(c){return c.rank!==btr;});
      const topKick=myKickers.length>0?Math.max.apply(null,myKickers.map(function(c){return RANK_VAL[c.rank];})):0;
      const tkName=['','','2','3','4','5','6','7','8','9','T','J','Q','K','A'][topKick]||'?';
      const tkJp=(RANK_JP[tkName]||tkName);
      const isTopK=topKick>=14;  // Aキッカー
      const isGoodK=topKick>=12; // Q以上
      const bRole=isTopK?'value':(isGoodK?'medium':'air');
      const bNote='ボードトリップス（'+btr+'-'+btr+'-'+btr+'）: 全員がトリップスを共有しており、'
        +'キッカー（あなたは'+tkJp+'）の強さが勝負です。'
        +'ただし相手がポケットペアを持っていればフルハウス（確実に負け）、'
        +btr+'を持っていればクアッズで絶対に負けます。'
        +(isTopK?' Aキッカーは最上位ですが、ポケットペア保有者には常に負けます。'
          :isGoodK?' '+tkJp+'キッカーはまずまずですが、ポケットペアに負けます。'
          :' '+tkJp+'キッカーは弱く、コールすら慎重に。')
        +' ポットコントロール・check-call中心を推奨。積極的なバリューベットは危険です。';
      return{role:bRole,note:bNote,isNut:false,isVuln:true,madeClass:'board_trips'};
    }
    // ---- 通常のトリップス: ボードペア + ホールカード1枚 ----
    const tripRank=Object.entries(Object.fromEntries(comm.map(c=>[c.rank,(comm.filter(b=>b.rank===c.rank).length)]))).find(([_,v])=>v>=2)?.[0];
    const myTripKick=tripRank?holeCards.find(c=>c.rank!==tripRank):holeCards[0];
    const kick=myTripKick?RANK_VAL[myTripKick.rank]:0;
    const tripVal=tripRank?RANK_VAL[tripRank]:0;
    const boardTripKick=boardRanks.find(r=>r!==tripVal);
    const kickVuln=kick<(boardTripKick||10);
    const kickName=['','','','','','','','','8','9','T','J','Q','K','A'][boardTripKick||10]||'';
    const myKickStr=myTripKick?(RANK_JP[myTripKick.rank]||myTripKick.rank):'';
    const hasTripAce=tripVal>=14||holeCards.some(function(c){return c.rank==='A'&&tripRank==='A';});
    const note='トリップス'+(kickVuln?'('+myKickStr+'キッカー)。同じトリップスでA〜'+kickName+'キッカーを持つ相手に負けます。check-callベースで慎重に。':' 相手もトリップスのキッカー次第。ポットコントロールしながらバリューを取りましょう。');
    return{role:hasTripAce?'strong':(kickVuln?'value':'strong'),note,isNut:false,isVuln:true,madeClass:'trips'};
  }

  if(cat===4){
    // [Codex fix 2026-05-28] Do not warn about impossible hand classes; paired boards only create full house/quads risk.
    const suitCnt={};
    comm.forEach(function(c){suitCnt[c.suit]=(suitCnt[c.suit]||0)+1;});
    const flushPossible=Object.values(suitCnt).some(function(v){return v>=3;});
    // [Claude fix 2026-06-09] ナッツストレート判定:
    // ヒーローのストレートより高いストレートが相手の2枚以下で作れるか確認。
    // 作れないならナッツ。(例: 7h6h on 8s5h4dAc2h → 4-5-6-7-8ストレート high=8。
    // 上位ストレート9-high以上はいずれも相手3枚以上必要 → ナッツ)
    const boardVals=comm.map(function(c){return c.value||(RANK_VAL?RANK_VAL[c.rank]:0)||0;});
    const strHighCard=evalResult&&evalResult.co&&evalResult.co[0]?evalResult.co[0].v:0;
    let higherStrPossible=false;
    if(strHighCard>=5){
      for(let top=strHighCard+1;top<=14;top++){
        const needed=[top,top-1,top-2,top-3,top-4];
        const fromBoard=needed.filter(function(v){return boardVals.indexOf(v)>=0;}).length;
        if(5-fromBoard<=2){higherStrPossible=true;break;}
      }
    }
    const isNutStr=strHighCard>=5&&!higherStrPossible;
    const isNut=isNutStr&&!flushPossible&&!tex.paired;
    const warnings=[];
    if(flushPossible)warnings.push('フラッシュ');
    if(tex.paired)warnings.push('フルハウス/クアッズ');
    let note;
    if(isNut){
      note='ナッツストレート。このボードで最強のハンドです。積極的にバリューを最大化しましょう。';
    }else{
      note='ストレート。'+(warnings.length?warnings.join('・')+'の可能性には注意しつつ、バリューを取りましょう。':'このボードではフラッシュもフルハウスも完成しにくく、強いバリューハンドです。');
    }
    return{role:isNut?'nutted':'strong',note,isNut,isVuln:!isNut&&(flushPossible||tex.paired),riskFlags:{flushPossible:flushPossible,pairedBoard:tex.paired,strongerFullHouseQuads:tex.paired}};
  }
  if(cat===5){
    const isNutFlush=hi===14&&holeCards.some(c=>RANK_VAL[c.rank]===14&&comm.some(b=>b.suit===c.suit));
    // [Codex fix 2026-05-26] ペアボードでは「ナッツフラッシュ」という表現を避け、Aハイフラッシュとして格下げ表示する。
    if(isNutFlush&&tex.paired){
      return{role:'strong',note:'Aハイフラッシュ。ペアボードのため全体ナッツではなく、フルハウス/クアッズに負けます。大きなレイズやオールインには相手レンジを慎重に見ましょう。',isNut:false,isVuln:true,nutFlush:true,madeClass:'flush',flushHighRank:hi,weakFlush:false,riskFlags:{pairedBoard:true,strongerFullHouseQuads:true}};
    }
    const weakFlush=hi<=9;
    return{role:isNutFlush?'nutted':'strong',note:(weakFlush?'弱いフラッシュ':'フラッシュ')+(isNutFlush?' (ナッツ)。積極的にバリューを取りましょう。':weakFlush?'。下のハンドから大きく取り切る手ではなく、大きなレイズには慎重に。':'（弱め）。大きなレイズには慎重に。'),isNut:isNutFlush,isVuln:tex.paired||weakFlush,nutFlush:isNutFlush,madeClass:'flush',flushHighRank:hi,weakFlush};
  }
  if(cat===6){
    // フルハウスのナッツ判定: トリップス部(co[0].v)が全7枚中の最高ランク = 上位FHなし
    const allVals=[...holeCards,...comm].map(c=>c.value);
    const maxVal=Math.max(...allVals);
    const isNutFH=evalResult.co&&evalResult.co[0]?evalResult.co[0].v>=maxVal:false;
    const fhRole=isNutFH?'nutted':'strong';
    const fhNote=isNutFH?'フルハウス（ナッツ）。超強力。積極的にバリューを取りましょう。':'フルハウス。強力ですが上位フルハウスに注意。積極的にバリューを取りましょう。';
    return{role:fhRole,note:fhNote,isNut:isNutFH,isVuln:false};
  }
  if(cat>=7)return{role:'nutted',note:cat===7?'フォーカード。ナッツ。バリューを最大化しましょう。':'ストレートフラッシュ/ロイヤル。最高ハンド。',isNut:true,isVuln:false,madeClass:cat===7?'quads':'straight_flush'};
  return{role:'unknown',note:'',isNut:false,isVuln:false};
}

// 相手の連続ベットによるレンジ補正（エクイティ割引）
function oppRangeAdj(hr,targetStreet){
  const streetOrder=['preflop','flop','turn','river'];
  const si=streetOrder.indexOf(targetStreet);
  if(si<=0)return 1.0;
  let betCount=0;
  for(let i=1;i<si;i++){
    const st=streetOrder[i];
    const calls=hr.decisions.filter(d=>d.street===st&&d.isHuman&&d.action==='call'&&d.toCall>0);
    if(calls.length>0)betCount++;
  }
  return[1.0,0.92,0.86,0.82][Math.min(betCount,3)];
}

function streetDecisionIndex(hr,d){
  const idx=hr.decisions.findIndex(function(x){return x===d;});
  return idx>=0?idx:hr.decisions.findIndex(function(x){
    return x.isHuman===d.isHuman&&x.street===d.street&&x.action===d.action&&x.toCall===d.toCall&&x.amount===d.amount&&x.pot===d.pot;
  });
}
function riverShowdownPressure(hr,d,role,nOpponents,betToPotRatio){
  if(d.street!=='river')return{factor:1,note:'',tags:[]};
  let factor=1;
  const tags=[];
  const idx=streetDecisionIndex(hr,d);
  const before=idx>=0?hr.decisions.slice(0,idx):hr.decisions;
  const riverBefore=before.filter(function(x){return x.street==='river';});
  const priorVillainBet=riverBefore.some(function(x){return !x.isHuman&&(x.action==='raise'||x.action==='allin');});
  const priorVillainCall=riverBefore.some(function(x){return !x.isHuman&&x.action==='call';});
  const villainBetTurn=before.some(function(x){return !x.isHuman&&x.street==='turn'&&(x.action==='raise'||x.action==='allin');});
  const villainBetFlop=before.some(function(x){return !x.isHuman&&x.street==='flop'&&(x.action==='raise'||x.action==='allin');});
  const villainCalledTurn=before.some(function(x){return !x.isHuman&&x.street==='turn'&&x.action==='call';});
  const humanBetTurn=before.some(function(x){return x.isHuman&&x.street==='turn'&&(x.action==='raise'||x.action==='allin');});
  const weakPair=['bottom_pair','low_pair','under_pair','board_pair'].includes(role.pairTier);
  const mediumOnePair=role.role==='medium'&&role.pairTier;
  const strongOnePair=(role.pairTier==='top_pair'||role.pairTier==='overpair')&&(role.role==='strong'||role.role==='value');

  if(weakPair){
    factor*=0.55;
    tags.push('弱いワンペア/ボードペアはブラフキャッチ専用');
  }else if(mediumOnePair){
    factor*=0.72;
    tags.push('中程度のワンペアはリバーで実現率を割引');
  }
  if(betToPotRatio>=1.0){
    factor*=weakPair?0.55:0.72;
    tags.push('ポット以上のリバーベットは強レンジ寄り');
  }else if(betToPotRatio>=0.65){
    factor*=weakPair?0.68:0.82;
    tags.push('大きめリバーベットでブラフ比率を低めに補正');
  }
  if(villainBetTurn&&d.toCall>0){
    factor*=0.76;
    tags.push('ターンからの継続ベットでレンジが強化');
  }
  if(villainBetFlop&&villainBetTurn&&d.toCall>0){
    factor*=0.82;
    tags.push('複数ストリートの圧力でワンペアの価値を割引');
  }
  if((weakPair||mediumOnePair)&&d.toCall>0&&betToPotRatio>=0.65&&(villainBetTurn||villainBetFlop)){
    factor*=villainBetFlop&&villainBetTurn?0.55:0.70;
    tags.push('初心者がやりがちなワンペア過剰コールを補正。リバー大サイズ＋前ストリート圧力では相手レンジを強く見る');
  }
  if(strongOnePair&&d.toCall>0&&betToPotRatio>=0.50&&villainCalledTurn&&humanBetTurn){
    // [Codex fix 2026-05-30] 完成ボードでターンコール後にリバーで打たれたワンペアは、Raw EQほど楽なコールではない。
    factor*=0.55;
    tags.push('ターンの薄いバリュー/プロテクトにコールされ、リバーで打ち返されたため、トップペアでも相手依存のブラフキャッチに格下げ');
  }else if(strongOnePair&&d.toCall>0&&betToPotRatio>=0.50){
    factor*=0.82;
    tags.push('トップペア強キッカーでもリバー中サイズ以上のベットにはレンジを割引');
  }
  if(nOpponents>=2){
    factor*=0.72;
    tags.push('マルチウェイではブラフ頻度を低く見積もる');
  }
  if(priorVillainBet&&priorVillainCall){
    factor*=0.45;
    tags.push('リバーでbet+callが入ったため超バリュー寄り');
  }
  const _gmRSP=getRangeMode();
  const note=tags.length?' 【'+(_gmRSP==='gto'?'GTOレンジ補正':'$2/$5実戦レンジ補正')+'】'+tags.join('。')+'。'+(_gmRSP==='gto'?'均衡相手のベットレンジ偏りのみを反映し、割引は控えめです。':'生EQより実効EQを低く評価します。'):'';
  return{factor:Math.max(0.18,Math.min(1,relaxPressureForMode(factor))),note,tags};
}

function riverMadeHandRisk(holeCards,comm,evalResult,role){
  if(!holeCards||!comm||comm.length<5||!evalResult)return{factor:1,note:'',fourFlushNoFlush:false,vulnerableValue:false};
  const suitCntBoard={};
  comm.forEach(function(c){suitCntBoard[c.suit]=(suitCntBoard[c.suit]||0)+1;});
  const fourFlushSuit=Object.keys(suitCntBoard).find(function(s){return suitCntBoard[s]>=4;});
  const allCards=[...holeCards,...comm];
  const suitCntAll={};
  allCards.forEach(function(c){suitCntAll[c.suit]=(suitCntAll[c.suit]||0)+1;});
  const hasMyFlush=Object.values(suitCntAll).some(function(v){return v>=5;});
  const threeFlushSuit=Object.keys(suitCntBoard).find(function(s){return suitCntBoard[s]>=3;});
  const fourFlushNoFlush=!!fourFlushSuit&&!hasMyFlush;
  const threeFlushNoFlush=!!threeFlushSuit&&!hasMyFlush;
  const tex=boardTex(comm);
  const cat=evalResult.cat;
  const vulnerableValue=(cat===2&&role&&role.isVuln)||(cat===4&&(tex.flushy>=3||tex.paired))||(cat===5&&role&&!role.isNut&&role.isVuln);
  let factor=1;
  const notes=[];
  if(fourFlushNoFlush&&cat<5){
    factor*=0.45;
    notes.push('4フラッシュボードで自分はフラッシュ未完成。ストレート/セット級でも相手のベットレンジはフラッシュ以上に寄りやすい');
  }else if(threeFlushNoFlush&&cat<5&&(role.pairTier==='top_pair'||role.pairTier==='overpair'||role.role==='medium')){
    factor*=0.78;
    notes.push('3フラッシュ完成ボードで自分はフラッシュ未完成。ワンペアのショーダウン価値を割引');
  }
  if(cat===5&&role&&!role.isNut&&role.isVuln){
    // [Codex fix 2026-05-26] ペアボードではAハイフラッシュも全体ナッツではない。
    factor*=role.nutFlush?0.78:0.70;
    notes.push((role.nutFlush?'ペアボード上のAハイフラッシュ。':'ペアボード上の非Aハイフラッシュ。')+'フルハウスに負けるため、薄いバリュー/ブラフキャッチ寄りに格下げ');
  }
  if(cat===2&&role&&role.isVuln){
    factor*=0.78;
    notes.push('ボードペア補完のツーペアは実質トップペア寄り。大きなバリューには慎重');
  }
  const note=notes.length?' 【リバー完成役リスク補正】'+notes.join('。')+'。':'';
  return{factor:Math.max(0.25,Math.min(1,factor)),note,fourFlushNoFlush,vulnerableValue};
}

function streetBettingPressure(hr,d,role,betToPotRatio,comm){
  if(!['flop','turn'].includes(d.street))return{factor:1,note:'',tags:[]};
  let factor=1;
  const tags=[];
  const idx=streetDecisionIndex(hr,d);
  const before=idx>=0?hr.decisions.slice(0,idx):hr.decisions;
  const pfRaises=hr.decisions.filter(function(x){return x.street==='preflop'&&(x.action==='raise'||x.action==='allin');});
  const lastPfr=pfRaises[pfRaises.length-1]||null;
  const humanWasLastPfr=!!(lastPfr&&lastPfr.isHuman);
  const posState=postflopPositionState(hr,d);
  const villainBetFlop=before.some(function(x){return !x.isHuman&&x.street==='flop'&&(x.action==='raise'||x.action==='allin');});
  const is3BetPot=pfRaises.length>=2;
  const weakPair=['under_pair','bottom_pair','low_pair','second_pair','board_pair'].includes(role.pairTier);
  const onePair=!!role.pairTier&&role.role==='medium';
  const topBoardRank=comm&&comm.length?Math.max.apply(null,comm.map(function(c){return RANK_VAL[c.rank]||0;})):0;
  const broadwayHigh=topBoardRank>=12;

  if(is3BetPot&&posState.isOOP&&!humanWasLastPfr&&weakPair){
    factor*=d.street==='flop'?0.45:0.32;
    tags.push('3BETポットでOOPの受け側。アンダーペア/弱いワンペアはレンジ実現率を大きく割引');
  }else if(is3BetPot&&posState.isOOP&&!humanWasLastPfr&&onePair){
    factor*=d.street==='flop'?0.68:0.55;
    tags.push('3BETポットでOOPの受け側。ワンペアは相手の強レンジに対して慎重に評価');
  }
  if(d.street==='turn'&&villainBetFlop&&d.toCall>0){
    factor*=weakPair?0.62:0.78;
    tags.push('フロップCB後のターン継続ベットで相手レンジが強化');
  }
  if(d.street==='turn'&&weakPair&&broadwayHigh){
    factor*=0.78;
    tags.push('K/Q/A高ボードの下ペアは改善が乏しく、ショーダウン到達率が低い');
  }
  if(betToPotRatio>=0.60&&weakPair){
    factor*=0.82;
    tags.push('中サイズ以上のベットに対して弱いワンペアの継続頻度を下げる');
  }
  const note=tags.length?' 【3BET/OOP実現率補正】'+tags.join('。')+'。生EQではなく相手レンジに対する実効EQで評価します。':'';
  return{factor:Math.max(0.16,Math.min(1,relaxPressureForMode(factor))),note,tags};
}

function calcSPR(humanChips,pot){return pot>0?Math.round(humanChips/pot*10)/10:99;}

// [Codex fix 2026-06-04] 実ハンド検査で頻出するワンペア過信を、ストリート圧力・SPR・ボード危険度で構造化する。
// [feature 2026-06-10] ハンドレビューを「場面→手→相手の傾向→数字→結論(混合比)→助言」の自然な一段落に再構築する。
// 全weight適用後に呼び、構造化フィールド(rawEqPct/effectiveEqPct/onePairProfile等)から本文を組み直す。
// 範囲: リング(非トーナメント)のポストフロップ call/fold/bet。詳細監査は別途メタチップで表示される。
function ftMixRatio(diff){
  const a=Math.abs(diff||0);
  if(a<=2)return'ほぼ互角(5:5)';
  if(a<=6)return'6:4';
  if(a<=12)return'7:3';
  return'8:2';
}
function composeNaturalReview(ev,d,hr){
  try{
    if(!ev||!d||ev.isHuman===false)return;
    if(hr&&hr.tournamentContext&&hr.tournamentContext.enabled)return;
    if(d.street==='preflop')return;
    const lane=d.action==='call'?'call':d.action==='fold'?'fold':(d.action==='raise'||d.action==='bet'||d.action==='allin')?'bet':null;
    if(!lane)return; // check等は現状維持
    const human=(hr.players||[]).find(function(p){return p&&p.isHuman;});
    if(!human||!human.holeCards||human.holeCards.length<2)return;
    const commLen={flop:3,turn:4,river:5}[d.street]||3;
    const comm=(hr.community||[]).slice(0,commLen);
    if(comm.length<3)return;
    const evalRes=HandEval.evaluate([...human.holeCards,...comm]);
    const role=handRole(human.holeCards,comm,evalRes);
    const roleLabel=(((role.note||'').split('。')[0])||'').trim()||'ノーペア';
    let posOOP=false; try{posOOP=!!postflopPositionState(hr,d).isOOP;}catch(e){}
    const posWord=posOOP?'アウトオブポジション':'インポジション';
    const streetJP={flop:'フロップ',turn:'ターン',river:'リバー'}[d.street]||d.street;
    const rawEq=ev.rawEqPct, effEq=ev.effectiveEqPct;
    const req=Math.round((d.potOdds||0)*100);
    let betPot;
    if(lane==='bet'){betPot=Math.round((d.amount||0)/Math.max(1,d.pot||1)*100);}
    else{const base=Math.max(1,(d.pot||0)-(d.toCall||0));betPot=Math.round((d.toCall||0)/base*100);}
    const sizeWord=betPot<=33?'小さめの':betPot<=66?'中程度の':betPot<=100?'大きめの':'オーバーサイズの';
    const mode=getRangeMode();
    const op=ev.onePairProfile;
    const idx=(hr.decisions||[]).indexOf(d);
    const before=idx>=0?hr.decisions.slice(0,idx):[];
    const vb=function(st){return before.some(function(x){return !x.isHuman&&x.street===st&&/raise|allin|bet/.test(x.action);});};
    const barrels=(vb('flop')?1:0)+(vb('turn')?1:0)+(vb('river')?1:0);
    const diff=(effEq!=null&&req!=null)?(effEq-req):null;
    const parts=[];
    // 場面+手
    if(lane==='bet') parts.push(streetJP+'。'+roleLabel+'で、'+posWord+'から'+sizeWord+'ベット(ポットの'+betPot+'%)を選ぶ場面です。');
    else parts.push(streetJP+'。'+roleLabel+'で、相手の'+sizeWord+'ベット(ポットの'+betPot+'%)を'+posWord+'で受ける場面です。');
    // 相手の傾向(複数バレル時)
    if(barrels>=2&&lane!=='bet') parts.push('相手は'+(barrels>=3?'3ストリート':'複数ストリート')+'続けて打っており、レンジは'+(mode==='live'?'バリューに偏ります(ライブ$2/$5ではブラフが足りません)':'ややバリュー寄りです')+'。');
    // 数字
    if(rawEq!=null&&effEq!=null){
      if(rawEq!==effEq) parts.push('生のエクイティは'+rawEq+'%ですが、相手の強いレンジを踏まえた実効エクイティは約'+effEq+'%。'+(lane!=='bet'?'コールに必要な勝率は'+req+'%です。':''));
      else if(lane!=='bet') parts.push('エクイティは約'+effEq+'%、コールに必要な勝率は'+req+'%です。');
    }
    // 結論(混合比)
    const liveOnePairFold=op&&op.verdict==='bad'&&lane==='call';
    let concl='';
    if(lane==='call'){
      if(liveOnePairFold) concl='GTO上はほぼ互角(5:5前後)ですが、ライブ$2/$5ではアウトオブポジションで連続バレルを受ける相手のレンジはブラフが不足します。実質的に6:4〜7:3でフォールド寄りで、相手が明らかにブラフ過多のタイプの時だけコールに回しましょう。';
      else if(op&&op.verdict==='border'){
        let lean;
        if(diff==null) lean='相手のブラフ頻度次第の判断になります。';
        else if(diff>=8) lean='ただしエクイティ的には必要勝率を上回っており、おおよそ'+ftMixRatio(diff)+'でコール寄りです。';
        else if(diff<=-8) lean='エクイティ的にも必要勝率に届かず、'+ftMixRatio(diff)+'でフォールド寄りです。';
        else lean='損得はほぼ互角('+ftMixRatio(diff)+')で、相手のブラフ頻度次第の判断になります。';
        concl='強いワンペアでも、ここまで打たれると明確なバリューではなく相手依存のブラフキャッチです。'+lean;
      }
      else if(diff==null) concl='相手のレンジとサイズ次第の判断です。';
      else if(diff>=8) concl='実効エクイティが必要勝率を'+diff+'ポイント上回るので、コールで問題ありません。';
      else if(Math.abs(diff)<=5||ev.isMix) concl='損得はほぼ互角で、ボーダーラインの判断です('+ftMixRatio(diff)+')。'+(mode==='live'?'ライブの相手なら':'相手のタイプ次第で')+(diff>=0?'コール':'フォールド')+'寄りです。';
      else if(diff<0) concl='必要勝率に'+Math.abs(diff)+'ポイント届かず、'+(mode==='live'?'ライブの相手ならフォールドが勝ちます':'フォールド寄りです')+'。';
      else concl=ftMixRatio(diff)+'でコール寄りです。';
    }else if(lane==='fold'){
      if(diff==null) concl='相手のレンジ次第ですが、フォールドは無難な判断です。';
      else if(ev.quality==='good') concl=(diff<=-10?'実効エクイティが必要勝率に'+Math.abs(diff)+'ポイント届かず、明確なフォールドです。':'エクイティが必要勝率にやや届かず、フォールドが有力です。');
      else if(ev.isMix||Math.abs(diff)<=5) concl='コールとフォールドの混合('+ftMixRatio(diff)+')。フォールドも許容内ですが、わずかにコールが勝ちます。';
      else concl='実効エクイティ'+effEq+'%は必要勝率'+req+'%を上回っており、本来はコールが勝ちます。フォールドはEVを逃しています。';
    }else{ // bet
      if(ev.quality==='good') concl='バリュー/主導権の取れる良いベットです。';
      else if(op&&(op.verdict==='bad'||op.verdict==='border')) concl='打つなら小〜中サイズに留め、危険なボードではチェックも自然です。ワンペアで大きいポットを作りすぎないようにしましょう。';
      else concl='サイズと相手の継続レンジを意識した判断です。';
    }
    if(concl) parts.push(concl);
    const text=parts.join('');
    if(text&&text.length>=12) ev.comment=text;
  }catch(e){/* 失敗時は既存コメントを維持 */}
}
function onePairPressureProfile(hr,d,role,tex,nOpponents){
  if(!d||d.street==='preflop'||!role)return null;
  const pairTier=role.pairTier;
  const note=role.note||'';
  const onePair=!!pairTier||/ワンペア|トップペア|中・低ペア|ミドルペア|オーバーペア/.test(note);
  if(!onePair||role.isNut||role.role==='nutted')return null;
  const spr=calcSPR(d.playerChipsBefore||0,d.pot||0);
  const lane=d.action==='check'?'check':d.action==='call'?'call':(d.action==='raise'||d.action==='bet'||d.action==='allin')?'bet':d.action;
  const basePot=d.toCall>0?Math.max(1,(d.pot||0)-(d.toCall||0)):Math.max(1,d.pot||1);
  const sizePct=lane==='call'?Math.round((d.toCall||d.amount||0)/basePot*100):(d.pot?Math.round((d.amount||0)/Math.max(1,d.pot)*100):0);
  const idx=streetDecisionIndex(hr,d);
  const before=idx>=0?hr.decisions.slice(0,idx):hr.decisions;
  const villainBetFlop=before.some(x=>!x.isHuman&&x.street==='flop'&&(x.action==='raise'||x.action==='allin'||x.action==='bet'));
  const villainBetTurn=before.some(x=>!x.isHuman&&x.street==='turn'&&(x.action==='raise'||x.action==='allin'||x.action==='bet'));
  const humanBetTurn=before.some(x=>x.isHuman&&x.street==='turn'&&(x.action==='raise'||x.action==='allin'||x.action==='bet'));
  const villainCalledTurn=before.some(x=>!x.isHuman&&x.street==='turn'&&x.action==='call');
  // [Claude fix 2026-06-09] weakPairから role.role==='medium' を除外。
  // top_pair + 弱キッカーはrole='medium'になるが、weakPairとして扱うと
  // ドライボードのTP標準CBへのコールが誤って'bad'になる。
  const weakPair=['board_pair','under_pair','bottom_pair','low_pair','second_pair'].includes(pairTier);
  // TP弱キッカー: weakPairより緩い扱い（mediumTopPair）
  const mediumTopPair=pairTier==='top_pair'&&role.role==='medium';
  const strongOnePair=['top_pair','overpair'].includes(pairTier)&&(role.role==='strong'||role.role==='value');
  // [Claude fix 2026-06-09] danger: 低カードのみの連番(2-3等)はhighConnect=falseなので除外。
  // Q23 rainbow(straightDraw=true だが highConnect=false) → danger=false(ドライボード) ✓
  const danger=!!(tex&&(tex.flushy>=3||tex.flushDraw||tex.twoTone||(tex.straightDraw&&tex.highConnect)||tex.paired));
  // [Claude fix 2026-06-09] pressureCountはヴィランの過去のベット数のみ。
  // 現在の自分のコールアクション(lane==='call')を加算していたのは前方参照バグ。
  const pressureCount=(villainBetFlop?1:0)+(villainBetTurn?1:0);
  // 強いドロー(8+アウト)があると受けのEV改善。リバー以外でのみ有効。
  const hasStrongDraw=!!(role.draw&&role.draw.outs>=8&&d.street!=='river');
  // [feature 2026-06-10] GTO/Liveモード。Liveは母集団のブラフ不足を織り込み、OOP×複数バレル×大サイズの強ワンペア受けをフォールド寄りに倒す。
  const _mode=getRangeMode();
  const _liveLean=_mode==='live';
  const _posSt=postflopPositionState(hr,d);
  const _isOOP=!!(_posSt&&_posSt.isOOP);
  let verdict='normal';
  let policy='ワンペアは相手レンジとサイズ次第で、薄いバリュー/ブラフキャッチ/ポット管理に分けます。';
  let risk='SPR約'+spr+' / '+(danger?'動的または完成寄りボード':'比較的静的なボード')+' / 圧力'+pressureCount+'段階';
  if(nOpponents>=2)risk+=' / マルチウェイ';
  // [Claude fix 2026-06-09] フォールドレーンの明示的処理。
  // evalFoldはcat=1(ワンペア)の生EQで判断するためボードペアでのフォールドを誤って'bad'と判定しやすい。
  // board_pair/under_pair等のweakPairフォールドは大半のシーンで正しいため、ここで補正。
  if(lane==='fold'){
    if(weakPair){
      if(sizePct<=20&&pressureCount===0&&spr>=6){
        // 非常に小さいベットで圧力なし: ボードペアでも一部コールできるボーダーライン
        verdict='border';
        policy='ボードペアはキッカーのみのショーダウン価値。極小サイズベットなら少頻度コールも考えられますが、フォールドでも問題ありません。';
      }else{
        // 通常サイズ以上、または圧力あり: ボードペアのフォールドは適切
        verdict='good';
        policy='ボードペアはキッカー勝負で実質的なハンド強度はありません。相手のベットに対してフォールドは適切な判断です。生EQに惑わされず、実現率が低いハンドでポットを大きくしないことが重要です。';
      }
    }
  }else if(lane==='check'){
    if(danger||spr>=7||nOpponents>=2){
      verdict='good';
      policy='このワンペアはチェックでショーダウン価値を守るポット管理が自然です。';
    }
  }else if(lane==='bet'){
    // [Claude fix 2026-06-09] ボードペア+オーバーカード(isOvercard)の専用ロジック。
    // KJ on 774 のようにホールカードがボードに絡まないPFRのオーバーカードは、
    // 「ワンペア管理」ではなく「レンジ優位を活かす小CB」フレームで評価する。
    // ペアドボードはBBが7xを持つ頻度が極めて低くPFRのCB頻度が最大になるカテゴリの一つ。
    const isBoardPairOvercard=pairTier==='board_pair'&&!!(role&&role.isOvercard);
    // ペアドボード自体(tex.paired)を除いた「追加の危険」= フラッシュ/高連番ストレートのみ
    const dangerExPaired=!!(tex&&(tex.flushy>=3||tex.flushDraw||(tex.straightDraw&&tex.highConnect)));
    if(isBoardPairOvercard&&hasStrongDraw&&sizePct<=65){
      // ケース1: オーバーカード + フラッシュドロー等の強ドロー → セミブラフとして正常
      verdict='normal';
      policy='ペアドボードのオーバーカード+フラッシュドローはセミブラフとして理想的な候補。降ろせばそのまま勝ち、コールされてもドロー完成のEVがあります。';
    }else if(isBoardPairOvercard&&sizePct<=45&&!dangerExPaired){
      // ケース2: オーバーカード + 小CB + ドライボード → レンジCBとして正常
      verdict='normal';
      policy='ペアドライボードのオーバーカードはPFRのレンジCBが推奨（25〜40%pot）。BBが7xを持つ頻度は低く、フォールドエクイティを安価に取れます。';
    }else if(isBoardPairOvercard&&sizePct>45){
      // ケース3: オーバーカード + やや大きいサイズ → borderに留める（bad は過剰）
      verdict='border';
      policy='ペアドボードのオーバーカードCBとして方向性は正しい。サイズは25〜40%potが推奨（強い手だけ続けられる大サイズは避ける）。';
    }else if(hasStrongDraw&&sizePct<=65&&d.street!=='river'){
      // ケース4: 一般的な強ドロー付きベット → badではなくborder
      verdict='border';
      policy='8アウト以上のドローはセミブラフとしてのベットを正当化します。降ろせばそのまま勝ち、コールされてもリバーで改善のEVがあります。';
    }else if(weakPair||(d.street==='river'&&!strongOnePair)||sizePct>=75||(danger&&sizePct>=55&&spr>=7)){
      verdict=weakPair||sizePct>=75?'bad':'border';
      policy='ワンペアで大きいポットを作りすぎない。打つなら小〜中サイズ、危険なターン/リバーはチェックも自然です。';
    }
  }else if(lane==='call'){
    if(weakPair||sizePct>=75||(d.street==='river'&&sizePct>=50&&(danger||villainBetTurn||villainBetFlop))||(d.street==='turn'&&sizePct>=60&&danger&&villainBetFlop)){
      // [Claude fix 2026-06-09] 強ドロー付きの場合: インプライドオッズがあるため'bad'→'border'に緩和
      if(hasStrongDraw&&sizePct<70&&pressureCount<3){
        verdict='border';
        policy='弱いワンペアでも8アウト以上のドローが付く場合、インプライドオッズが補正します。ドロー完成時のバリューを含めて判断してください。';
      }else{
        // [Claude fix 2026-06-10] strongOnePair(TPTK等)はsizePct>=75やpressureCount>=2だけで'bad'にしない。
        // EV的に+EVでも「ワンペアだから」という定性ルールで上書きする内部矛盾を解消。
        // [feature 2026-06-10] Liveモードのみ: OOP×3ストリート圧力×大サイズの強ワンペアは母集団のブラフ不足で降り(bad)。
        // [Codex fix 2026-06-12] 強いトップペアでも、ライブ$2/$5のリバーで複数ストリート圧力＋大きめサイズは
        // OOP推定に依存しすぎず「受けすぎ」候補にする。位置推定が曖昧でも完成寄り/大サイズなら母集団のブラフ不足を優先。
        const _liveRiverFold=_liveLean&&strongOnePair&&d.street==='river'&&pressureCount>=2&&sizePct>=55&&(_isOOP||danger||sizePct>=70);
        verdict=(weakPair||(pressureCount>=2&&!strongOnePair)||(sizePct>=75&&!strongOnePair)||_liveRiverFold)?'bad':'border';
        policy=_liveRiverFold
          ?'GTO上はインディファレントですが、ライブ$2/$5ではOOPで3ストリートの大ベットを受ける相手レンジはブラフ不足。実効的にフォールドが勝ちます。'
          :'ワンペア受けを必要EQだけで正当化せず、相手の複数ストリート圧力と次ストリートの難しさを重く見ます。';
      }
    }else if((strongOnePair||mediumTopPair)&&sizePct>=50&&(villainBetTurn||(d.street==='river'&&villainBetFlop))){
      // [Claude fix 2026-06-09] 2ndバレル以降またはリバーでのTPコールのみborder。
      // フロップの初回CBに対するTPコールはここに来ない(villainBetTurnはまだfalse)。
      verdict='border';
      policy='トップペア(弱キッカー含む)でも、複数ストリートの継続ベットには慎重なブラフキャッチ判断が必要です。';
    }
  }
  if(d.street==='river'&&strongOnePair&&lane==='call'&&humanBetTurn&&villainCalledTurn&&sizePct>=45){
    verdict='border';
    policy='ターンでこちらの薄いバリューにコールされ、リバーで打たれた形はトップペアでも相手依存のブラフキャッチです。';
  }
  const isBoardPairOvercardRet=pairTier==='board_pair'&&!!(role&&role.isOvercard);
  return{street:d.street,lane,spr,sizePct,pairTier,weakPair,mediumTopPair,strongOnePair,danger,pressureCount,verdict,policy,risk,isBoardPairOvercard:isBoardPairOvercardRet,isOOP:_isOOP,mode:_mode};
}
function onePairPressureProfileText(profile){
  if(!profile)return'';
  const lane={check:'チェック',call:'コール',bet:'ベット/レイズ'}[profile.lane]||profile.lane;
  return profile.street.toUpperCase()+' / '+lane+' / '+profile.verdict+'：'+profile.policy+' 注意: '+profile.risk;
}

function harmonizeFinalEvaluationText(ev){
  if(!ev)return;
  let c=ev.comment||'';
  if((ev.quality==='bad'||(ev.deduction||0)>=10)&&c){
    // [Codex fix 2026-06-25] 後段補正でbadになった後も、前段の「正解/明確コール/許容」が残る矛盾を消す。
    c=c.replace(/^正解。?/,'');
    c=c.replace(/EV優位（[^。]+）で明確なコールです。/g,'最終評価では、必要EQだけでは正当化しにくい判断です。');
    c=c.replace(/明確なコールスポット。/g,'最終評価では、相手レンジと今後のプレッシャーを重く見る場面です。');
    c=c.replace(/境界フォールド — 降りても大きな問題はありませんが、/g,'フォールドは見直したい判断です。');
    c=c.replace(/若干のEV優位。/g,'表面上は少し足りそうに見えても、最終評価では慎重に扱います。');
    c=c.replace(/コールで問題ありません。/g,'コールは相手依存です。');
    c=c.replace(/完全な正解ではなく/g,'完全な推奨ではなく');
    c=c.replace(/ベットは合理的な選択です。/g,'理論上は混ざりますが、この局面とサイズでは見直したいベットです。');
    c=c.replace(/ベットは合理的な選択。/g,'理論上は混ざりますが、この局面とサイズでは見直したいベットです。');
    c=c.replace(/どちらも許容範囲です。/g,'最終評価では、相手レンジとサイズを重く見て慎重に扱います。');
  }
  if(ev.onePairProfile&&ev.onePairProfile.verdict==='bad'){
    c=c.replace(/EV優位（[^。]+）で明確なコールです。/g,'ワンペア監査後は、必要EQだけでは正当化しない受けすぎ候補です。');
    c=c.replace(/若干のEV優位。/g,'ワンペアとしては次ストリートの圧力まで見る必要があります。');
  }
  ev.comment=c.replace(/。。+/g,'。').replace(/\s+/g,' ').trim();
}

function postflopPositionState(hr,d){
  const idx=streetDecisionIndex(hr,d);
  const before=idx>=0?hr.decisions.slice(0,idx):hr.decisions;
  const sameBefore=before.filter(function(x){return x.street===d.street;});
  const humanBefore=sameBefore.some(function(x){return x.isHuman;});
  const villainBefore=sameBefore.some(function(x){return !x.isHuman;});
  // [Codex fix 2026-05-30] CO/BTNなどの名前ではなく、そのストリートで実際に後から行動しているかでIP/OOPを判定する。
  if(humanBefore)return{isIP:false,isOOP:true,villainBefore:villainBefore,humanBefore:humanBefore};
  if(villainBefore)return{isIP:true,isOOP:false,villainBefore:villainBefore,humanBefore:humanBefore};
  return{isIP:false,isOOP:true,villainBefore:false,humanBefore:false};
}

function limpIsoCallContext(hr){
  const pref=hr.decisions.filter(function(x){return x.street==='preflop';});
  const humanOpenLimp=pref.some(function(x){return x.isHuman&&x.action==='call'&&!x.facingRaise&&(x.toCall||0)>0;});
  const villainIso=pref.some(function(x){return !x.isHuman&&(x.action==='raise'||x.action==='allin')&&pref.indexOf(x)>pref.findIndex(function(y){return y.isHuman&&y.action==='call'&&!y.facingRaise;});});
  const humanIsoCall=pref.some(function(x){return x.isHuman&&x.action==='call'&&x.facingRaise;});
  return{isLimpIsoCall:humanOpenLimp&&villainIso&&humanIsoCall};
}

function cautiousOnePairBetPlan(pot,d,role,tex,isIP){
  if(!pot||!role)return null;
  const onePair=(role.pairTier==='top_pair'||role.pairTier==='overpair')&&(role.role==='strong'||role.role==='value'||role.role==='medium');
  if(!onePair||role.isNut)return null;
  const dangerous=tex&&(tex.flushy>=3||tex.flushDraw||tex.straightDraw||tex.dynamic||tex.paired);
  if(!dangerous)return null;
  function plan(pct){
    pct=standardBetSizePct(pct);
    return{pct:pct,amt:Math.round(pot*pct/100)};
  }
  if(d.street==='flop')return plan(isIP?45:40);
  if(d.street==='turn')return plan(isIP?40:33);
  if(d.street==='river')return plan(isIP?45:40);
  return null;
}

function postflopContext(hr,d,role,nOpponents,rawEq){
  const pos=d.position||'MP';
  const posState=postflopPositionState(hr,d);
  const isOOP=posState.isOOP;
  const isMultiway=nOpponents>=2;
  const pfRaises=hr.decisions.filter(function(x){return x.street==='preflop'&&(x.action==='raise'||x.action==='allin');});
  const lastPfr=pfRaises[pfRaises.length-1]||null;
  const humanWasPFR=!!(lastPfr&&lastPfr.isHuman);
  const limpIso=limpIsoCallContext(hr).isLimpIsoCall;
  let realization=1.0;
  if(isOOP)realization*=0.82;
  if(limpIso)realization*=0.88;
  if(isMultiway)realization*=nOpponents>=3?0.62:0.72;
  if(role.role==='air')realization*=0.72;
  else if(role.role==='medium'||role.pairTier==='board_pair')realization*=0.82;
  else if(role.role==='draw')realization*=0.92;
  else if(role.role==='strong'||role.role==='nutted')realization*=1.05;
  // [Codex fix 2026-05-26] メイドハンド+強ドローはターン/リバー改善があり、弱いペア単体より実現率を高く見る。
  if(role.draw&&role.draw.outs>=8&&d.street!=='river')realization*=1.10;
  realization=Math.max(0.35,Math.min(1.08,realization));
  // [fix 2026-06-10] リバーは実現率1.0（ショーダウン確定）。
  if(d.street==='river')realization=1.0;

  const commLen={flop:3,turn:4,river:5}[d.street]||3;
  const tex=boardTex(hr.community.slice(0,commLen));
  let rangeScore=humanWasPFR?0.62:0.42;
  if(isOOP)rangeScore-=0.08;
  if(limpIso)rangeScore-=0.10;
  if(isMultiway)rangeScore-=0.12;
  if(tex.paired&&!humanWasPFR)rangeScore+=0.04;
  let nutScore=humanWasPFR?0.50:0.44;
  if(limpIso)nutScore-=0.08;
  if(tex.paired&&!humanWasPFR)nutScore+=0.08;
  if(isMultiway)nutScore-=0.06;
  if(role.isNut||role.role==='nutted')nutScore=0.82;

  function band(v){
    if(v>=0.62)return'高';
    if(v>=0.45)return'中';
    return'低';
  }
  const realizedEq=Math.round(rawEq*realization*100);
  const notes=[];
  if(isOOP)notes.push('OOP');
  if(limpIso)notes.push('リンプ→アイソコール側');
  if(isMultiway)notes.push((nOpponents+1)+'way');
  if(role.role==='medium'||role.pairTier==='board_pair'||role.role==='air')notes.push('SDV中心');
  return{
    rawEqPct:Math.round(rawEq*100),
    realizedEqPct:realizedEq,
    realizationPct:Math.round(realization*100),
    rangeAdv:band(rangeScore),
    nutAdv:band(nutScore),
    contextNote:notes.length?' 【実現率補正】'+notes.join('・')+'のため、Raw EQより実戦上の価値を低く見積もります。':''
  };
}

// ===== ソルバー頻度推定 v2 =====
// P(solver bets) given equity, street, role, texture
// inPosCheck: ヴィランチェック後のIPベット（レンジcapped補正）
// isIP: インポジション（BTN/CO）かどうか
function solverBetProb(eq,street,role,tex,isHU,inPosCheck,isIP,nOpponents){
  isIP=isIP||false;
  nOpponents=nOpponents||1;
  const isRiver=street==='river';
  const isTurn=street==='turn';

  // マルチウェイ補正: 3way以上はCB頻度が大幅低下
  // 実戦/ソルバー共にマルチウェイでのベット頻度はHUの50-65%程度
  const mwMult=nOpponents<=1?1.0:nOpponents===2?0.65:0.50;

  // IP補正: IPはOOPより約15%多くbet、OOP×マルチウェイは若干少なく
  const ipAdj=isIP?1.15:(isHU?1.0:0.90);

  // ナッツ/超強ハンド: マルチウェイでもバリュー主体だがslowplay増加
  if(role.isNut||role.role==='nutted'){
    const nutMwMult=nOpponents<=1?1.0:nOpponents===2?0.88:0.75;
    return (isIP?0.72:0.60)*nutMwMult;
  }

  // リバー極性補正: EQ依存型（薄バリューほど強く補正、強バリューはほぼ無し）
  const polarMult=inPosCheck?0.28:1.0;
  const riverPolar=isRiver?Math.max(0,0.22-eq*0.22)*polarMult:0;
  const turnPolar=isTurn?0.06*polarMult:0;
  const polarFactor=riverPolar+turnPolar;
  // [Codex fix 2026-05-26] メイドハンドに付随する強いドローはベット頻度を押し上げる。
  const madeDraw=(!isRiver&&role.draw)?role.draw:null;
  const madeDrawBoost=madeDraw&&madeDraw.outs>=8
    ?(madeDraw.flush&&madeDraw.straight?0.20:0.14)
    :(madeDraw&&madeDraw.gutshot?0.05:0);

  // ドローハンド: セミブラフとして評価（マルチウェイはブラフ価値低下）
  if(role.role==='draw'){
    const draw=role.draw||{};
    const ipD=isIP?1.12:1.0;
    if(draw.flush&&draw.straight)return Math.min(0.84,Math.max(0.25,(0.52+(eq-0.50)*0.9)*ipD))*mwMult;
    if(draw.flush||draw.oesd)return Math.min(0.72,Math.max(0.15,(0.38+(eq-0.35)*0.6)*ipD))*mwMult;
    // ガットショット
    return Math.min(0.42,Math.max(0.05,(0.20+(eq-0.28)*0.5)*ipD))*mwMult;
  }

  if(role.role==='strong'){
    const base=(eq-0.44)*2.2*ipAdj;
    return Math.max(0.10,Math.min(0.90,base-polarFactor))*mwMult;
  }
  if(role.role==='value'){
    const eqBase=inPosCheck?0.47:0.51;
    const mult=(inPosCheck?2.1:1.9)*ipAdj;
    const base=(eq-eqBase)*mult;
    return Math.max(0.04,Math.min(0.80,base+madeDrawBoost-polarFactor))*mwMult;
  }
  if(role.role==='medium'){
    const base=(eq-0.57)*1.6*ipAdj;
    return Math.max(0.02,Math.min(0.68,base+madeDrawBoost-polarFactor*1.4))*mwMult;
  }
  if(role.role==='air'){
    const bluffBase=tex.dynamic?0.28:0.16;
    const base=isHU?bluffBase*1.25:bluffBase;
    return Math.min(0.40,base*(isIP?1.20:1.0))*mwMult;
  }
  return Math.max(0.05,Math.min(0.82,(eq-0.50)*2.1*ipAdj-polarFactor))*mwMult;
}

// ソルバー頻度 → EV損失 → 減点 変換
// freq: P(solver takes the action that was taken)
function freqToDeduction(freq,street){
  const sw=STREET_W[street]||1.0;
  // freq >= 0.62: ほぼ正解
  // freq 0.45-0.62: 混合戦略（どちらも許容）
  // freq 0.32-0.45: 微差EV損失（low）
  // freq 0.18-0.32: 中程度EV損失（moderate）
  // freq < 0.18: 大幅EV損失（significant）
  if(freq>=0.75) return{quality:'good',deduction:0,isMix:false,evLoss:'none',freqPct:Math.round(freq*100)};
  if(freq>=0.62) return{quality:'good',deduction:Math.round(2*sw),isMix:false,evLoss:'minimal',freqPct:Math.round(freq*100)};
  if(freq>=0.45) return{quality:'ok',deduction:0,isMix:true,evLoss:'mix',freqPct:Math.round(freq*100)};
  if(freq>=0.32) return{quality:'ok',deduction:Math.round(8*sw),isMix:false,evLoss:'low',freqPct:Math.round(freq*100)};
  if(freq>=0.18) return{quality:'bad',deduction:Math.round(18*sw),isMix:false,evLoss:'moderate',freqPct:Math.round(freq*100)};
  return{quality:'bad',deduction:Math.round(30*sw),isMix:false,evLoss:'significant',freqPct:Math.round(freq*100)};
}

function suggestBet(pot,eq,street){
  let pct;
  const mode=typeof getRangeMode==='function'?getRangeMode():'live';
  if(mode==='gto'){
    if(street==='river'){pct=eq>0.92?100:eq>0.80?75:eq>0.68?60:45;}
    else if(street==='turn'){pct=eq>0.75?75:eq>0.62?65:50;}
    else{pct=eq>0.70?65:eq>0.56?50:33;}
  }else{
    if(street==='river'){pct=eq>0.92?100:eq>0.80?75:eq>0.68?50:33;}
    else if(street==='turn'){pct=eq>0.78?75:eq>0.62?50:33;}
    else{pct=eq>0.75?75:eq>0.58?50:33;}
  }
  pct=standardBetSizePct(pct);
  return{pct,amt:Math.round(pot*pct/100),mode};
}
function formatBetSuggestion(label,plan,d){
  if(!plan)return label;
  const stack=d&&d.playerChipsBefore!=null?d.playerChipsBefore:null;
  if(stack!=null&&stack>0&&plan.amt>=stack){
    return label+'オールイン '+stack+'T（スタック不足のため'+plan.pct+'%potは打てません）';
  }
  return label+'ポットの'+plan.pct+'% ('+plan.amt+'T)';
}

// [Codex fix 2026-06-21] 初心者向けのベットサイズは、常に同じ基準へ丸めて表示・練習する。
function standardBetSizePct(pct){
  const sizes=[33,50,75,100,125];
  pct=Math.max(0,Math.round(+pct||0));
  let best=sizes[0],dist=Math.abs(pct-best);
  sizes.forEach(function(s){
    const d=Math.abs(pct-s);
    if(d<dist){best=s;dist=d;}
  });
  return best;
}
function preflopOpenQuickOptions(bb,totalStack){
  const cap=Math.max(0,Math.round(totalStack||0));
  const b=Math.max(1,Math.round(bb||1));
  return [[2,'2BB'],[2.5,'2.5BB'],[3,'3BB']].map(function(arr){
    const amt=Math.round(Math.min(b*arr[0],cap));
    return{label:arr[1],amt:amt,title:'プリフロップの標準オープンサイズ'};
  }).filter(function(o){return o.amt>0;});
}
function raiseOverBetQuickOptions(currentBet,minRaise,totalStack){
  const cap=Math.max(0,Math.round(totalStack||0));
  const cur=Math.max(1,Math.round(currentBet||1));
  const minR=Math.max(1,Math.round(minRaise||cur));
  return [[2,'2x'],[3,'3x'],[4,'4x'],[5,'5x']].map(function(arr){
    const amt=Math.round(Math.min(cur*arr[0],cap));
    return{label:arr[1],amt:amt,title:'相手ベット額に対するレイズ倍率'};
  }).filter(function(o){return o.amt>=minR&&o.amt>0;});
}
function postflopQuickBetOptions(pot,minBet,totalStack){
  // [Codex fix 2026-06-15] 初心者が毎回同じ基準でサイズ選択を練習できるよう、表示セットを固定する。
  // 33/50/75/100/125%から選び、最小ベット未満は内部的にminへ丸める。
  const cap=Math.max(0,Math.round(totalStack||0));
  const min=Math.max(1,Math.round(minBet||1));
  const basePot=Math.max(1,Math.round(pot||1));
  const out=[];
  function add(label,amt,title){
    const a=Math.round(Math.min(Math.max(amt,min),cap));
    if(a<=0)return;
    out.push({label:label,amt:a,title:title||''});
  }
  [33,50,75,100,125].forEach(function(pct){
    const raw=Math.round(basePot*pct/100);
    add(pct+'%',raw,raw<min?'最小ベット未満のため実際は最小ベットになります':'');
  });
  return out;
}

// ===== ポストフロップ評価 (EV損失ベース) =====

function evalCheck(d,hr,human,nOpponents){
  const hc=human.holeCards;
  if(!hc||hc.length<2)return{quality:'ok',deduction:0,comment:'チェック。'};
  const commLen={flop:3,turn:4,river:5}[d.street]||3;
  const comm=hr.community.slice(0,commLen);
  const eq=estimateEquity(hc,comm,nOpponents,2000)*oppRangeAdj(hr,d.street);
  const pot=d.pot||0;
  const tex=boardTex(comm);
  const prevCommLenCk={flop:0,turn:3,river:4}[d.street]||0;
  const boardTextureCk=comm.length>=3?boardTextureProfile(comm,d.street,prevCommLenCk?hr.community.slice(0,prevCommLenCk):[]):null;
  const evalRes=hc.length&&comm.length>=3?HandEval.evaluate([...hc,...comm]):null;
  const role=evalRes?handRole(hc,comm,evalRes):{role:'unknown',note:'',isNut:false,isVuln:false};
  const isRiver=d.street==='river';
  const isTurn=d.street==='turn';
  const isHU=nOpponents===1;
  const eqPct=Math.round(eq*100);
  const pfCtx=postflopContext(hr,d,role,nOpponents,eq);

  // 3-betポット検出
  const _pfRaisesCk=hr.decisions.filter(d2=>d2.street==='preflop'&&(d2.action==='raise'||d2.action==='allin'));
  const is3BetPotCk=_pfRaisesCk.length>=2;
  const humanWas3BetterCk=is3BetPotCk&&hr.decisions.some(d2=>d2.street==='preflop'&&d2.isHuman&&(d2.action==='raise'||d2.action==='allin')&&d2.facingRaise);
  const lastPFAggCk=_pfRaisesCk[_pfRaisesCk.length-1]||null;
  const humanWasLastPFAggCk=humanWasLastPreflopAggressor(hr);
  // ブロッカー検出
  const _blkCk=(function(){
    const _sCnt={};comm.forEach(function(c){_sCnt[c.suit]=(_sCnt[c.suit]||0)+1;});
    const _fsCk=Object.entries(_sCnt).filter(function(e){return e[1]>=3;}).map(function(e){return e[0];});
    let _nfbCk=false,_fbsCk=null;
    hc.forEach(function(c){if(RANK_VAL[c.rank]===14&&_fsCk.includes(c.suit)){_nfbCk=true;_fbsCk=c.suit;}});
    return{nutFlushBlock:_nfbCk,flushBlockSuit:_fbsCk};
  })();
  // IP check-back detection: ヴィランが先にチェックし、ヒューマンがcheck-backした場合
  const myDecIdxCk=hr.decisions.findIndex(d2=>d2===d);
  const villainCkBefore=myDecIdxCk>0&&hr.decisions.slice(0,myDecIdxCk).some(
    d2=>d2.street===d.street&&!d2.isHuman&&d2.action==='check'
  );
  // IP判定: 席名ではなく実際の行動順で見る
  const posStateCk=postflopPositionState(hr,d);
  let isIPck=posStateCk.isIP;
  // OOPリバーチェック: ターンでレイズをコールした後にリバーチェックするのは正解(ドンクベット回避)
  const myIdxCk2=hr.decisions.findIndex(function(d2){return d2===d;});
  const calledRaiseOnTurn=hr.decisions.slice(0,myIdxCk2).some(function(d2){
    return d2.isHuman&&d2.street==='turn'&&d2.action==='call'&&d2.facingRaise;
  });
  const isOOPRiverCheckAfterRaiseCall=d.street==='river'&&!isIPck&&calledRaiseOnTurn;
  // ソルバーがベットする確率 → チェックの頻度 = 1 - betProb
  const limpIsoCk=limpIsoCallContext(hr).isLimpIsoCall;
  let betProb=solverBetProb(eq,d.street,role,tex,isHU,villainCkBefore,isIPck,nOpponents);
  const madeRiskCheck=riverMadeHandRisk(hc,comm,evalRes,role);
  const cautiousRiverValue=isRiver&&madeRiskCheck.vulnerableValue&&!role.isNut;
  const topPairRiverValue=isRiver&&!role.isNut&&(role.pairTier==='top_pair'||role.pairTier==='overpair')&&(role.role==='strong'||role.role==='value');
  if(cautiousRiverValue){
    betProb*=role.role==='strong'?(isIPck?0.72:0.50):(isIPck?0.55:0.38);
  }
  if(topPairRiverValue){
    betProb*=isIPck?0.72:0.52;
    if(tex.dynamic||tex.flushy>=3||tex.paired)betProb*=0.85;
  }
  // 3-betポット アグレッサーCBet補正
  if(is3BetPotCk&&humanWas3BetterCk&&humanWasLastPFAggCk&&d.street==='flop'){betProb=Math.min(0.90,betProb*1.38);}
  // [Codex fix 2026-05-28] OOP to the last preflop aggressor: checking is the default, not a missed donk bet.
  if(d.toCall===0&&!isIPck&&!humanWasLastPFAggCk&&_pfRaisesCk.length>0){betProb*=0.45;}
  if(limpIsoCk&&!isIPck&&d.toCall===0&&!humanWasLastPFAggCk){
    // [Codex fix 2026-05-30] リンプ→BTNアイソにOOPコールした側はレンジ/ナッツ不利。トップペアでもドンク強制にしない。
    betProb*=0.72;
  }
  const pairedBoardValueCaution=role.isVuln&&(role.role==='value'||role.role==='medium')&&((role.note||'').includes('ボードペア')||(role.note||'').includes('ボード')&&(role.note||'').includes('補完'));
  if(pairedBoardValueCaution){
    betProb*=isIPck?0.62:0.42;
    if(nOpponents>=2)betProb*=0.85;
  }
  const textureFreqCk=boardTextureFrequencyAdjustment(betProb,boardTextureCk,{street:d.street,role,isPfr:humanWasLastPFAggCk,isIP:isIPck,nOpponents});
  betProb=textureFreqCk.betProb;
  const checkProb=1-betProb;
  let sc=freqToDeduction(checkProb,d.street);
  sc={...sc,boardTextureMixProfile:textureFreqCk};
  const isNutLike=role.isNut||role.role==='nutted';
  const isStrongHand=isNutLike||role.role==='strong';
  const isIPRiverNutCheck=d.street==='river'&&isIPck&&villainCkBefore&&isNutLike;
  const isIPTurnNutCheck=d.street==='turn'&&isIPck&&villainCkBefore&&isNutLike;

  // ナッツ・強ハンドのチェック: slowplay/trap/レンジ保護として有効 → 減点緩和
  if(sc.quality!=='good'&&sc.deduction>0&&isNutLike){
    sc={...sc,deduction:Math.min(sc.deduction,5),isMix:sc.deduction<=8};
  }else if(sc.quality==='bad'&&sc.deduction>0&&isStrongHand&&!isNutLike){
    // ストレート/フラッシュ等の強ハンドtrap-check: ナッツ未満でも減点上限を設ける
    const sw6=STREET_W[d.street]||1.0;
    sc={...sc,deduction:Math.min(sc.deduction,Math.round(18*sw6))};
  }else if(sc.quality==='ok'&&sc.deduction>0&&isStrongHand){
    sc={...sc,deduction:Math.round(sc.deduction*0.6)};
  }

  // マルチウェイ補正: 3way以上はCB頻度が大幅低下
  const isMultiway=nOpponents>=2;
  const mwNote=isMultiway?' マルチウェイ（'+( nOpponents+1)+'way）ではCB頻度が大幅低下。レンジ全体で頻度を絞るのが自然。':'';

  let comment='チェック（Raw EQ約'+eqPct+'%、実効EQ約'+pfCtx.realizedEqPct+'%）。'+role.note+pfCtx.contextNote;
  const cautiousRiverNote=cautiousRiverValue?' '+madeRiskCheck.note+'$2/$5では大きなバリューより、チェックまたは小〜中サイズの薄いバリューを優先します。':'';
  const topPairRiverNote=topPairRiverValue?' 【リバー薄バリュー補正】トップペア強キッカー/オーバーペアは強いSDVですが、リバーでは相手のコールレンジが絞られます。$2/$5初心者向けには「常に大きく打つ」より、チェックバックまたは小〜中サイズの薄いバリューを混ぜます。':'';
  const pairedBoardNote=pairedBoardValueCaution?' 【ボードペア補正】ボード側のペアで手役表示がツーペアになっていても、実戦価値はトップペア/ショーダウンバリュー寄りです。OOPや3BETポットでも自動的な大ベット必須にはしません。':'';
  function checkBetPlan(){
    const plan=suggestBet(pot,eq,d.street);
    const texturePlan=boardTextureSizePlan(pot,boardTextureCk,role,{street:d.street,isPfr:humanWasLastPFAggCk,isIP:isIPck,nOpponents,preferredSizePct:textureFreqCk&&textureFreqCk.preferredSizePct});
    if(cautiousRiverValue&&pot>0){
      const pct=role.role==='strong'?55:45;
      return{pct,amt:Math.round(pot*pct/100)};
    }
    if(topPairRiverValue&&pot>0){
      const pct=isIPck?55:45;
      return{pct,amt:Math.round(pot*pct/100)};
    }
    const cautiousOnePairPlan=cautiousOnePairBetPlan(pot,d,role,tex,isIPck);
    if(cautiousOnePairPlan)return cautiousOnePairPlan;
    if(texturePlan)return texturePlan;
    return plan;
  }
  if(sc.isMix){
    const mixBet=checkBetPlan();
    comment+=' 推定ではbet/checkの混合戦略（bet率約'+Math.round(betProb*100)+'% / check率約'+Math.round(checkProb*100)+'%）。どちらも許容範囲です。'+mwNote+cautiousRiverNote+topPairRiverNote+pairedBoardNote;
    if(isHU&&!isMultiway)comment+=' HUでは薄バリューベットも有効。';
    if(isNutLike)comment+=' 強ハンドのチェックはtrap/レンジ保護として有効。';
    return{...sc,rawEqPct:pfCtx.rawEqPct,effectiveEqPct:pfCtx.realizedEqPct,realizationPct:pfCtx.realizationPct,rangeAdv:pfCtx.rangeAdv,nutAdv:pfCtx.nutAdv,comment,suggest:pot>0&&betProb>=0.25?formatBetSuggestion('ベットするなら',mixBet,d):''};
  }else if(sc.quality==='good'){
    const altBet=checkBetPlan();
    comment+=' チェックが推奨される局面です（推定check率約'+Math.round(checkProb*100)+'%）。'+mwNote+cautiousRiverNote+topPairRiverNote+pairedBoardNote;
    if(isNutLike&&sc.deduction===0)comment+=' 強ハンドのslowplay/checkは戦略的に有効。';
    if(betProb>=0.35&&pot>0)return{...sc,rawEqPct:pfCtx.rawEqPct,effectiveEqPct:pfCtx.realizedEqPct,realizationPct:pfCtx.realizationPct,rangeAdv:pfCtx.rangeAdv,nutAdv:pfCtx.nutAdv,comment,suggest:formatBetSuggestion('ベットを混ぜるなら',altBet,d)};
  }else if(sc.quality==='ok'){
    const suggest=checkBetPlan();
    if(isNutLike){
      comment+=' slowplay/trap戦略として自然。ベットも有力（推定bet率約'+Math.round(betProb*100)+'%）。'+mwNote+cautiousRiverNote+topPairRiverNote+pairedBoardNote;
    }else{
      comment+=' ベットも有力な選択肢（推定bet率約'+Math.round(betProb*100)+'%）。'+mwNote+cautiousRiverNote+topPairRiverNote+pairedBoardNote;
    }
    return{...sc,rawEqPct:pfCtx.rawEqPct,effectiveEqPct:pfCtx.realizedEqPct,realizationPct:pfCtx.realizationPct,rangeAdv:pfCtx.rangeAdv,nutAdv:pfCtx.nutAdv,comment,suggest:pot>0?formatBetSuggestion('ベット案: ',suggest,d):''};
  }else{
    // OOPリバーチェック（ターンレイズコール後）: ドンクベット回避で正解
    if(isOOPRiverCheckAfterRaiseCall){
      comment+=' OOP（ターンで相手のレイズをコール後）のリバーチェックは正解。このラインからのドンクベットはGTOでほぼ存在しない。チェックでインデュース/ブラフキャッチ態勢を取るのが標準。';
      return{quality:'good',deduction:0,rawEqPct:pfCtx.rawEqPct,effectiveEqPct:pfCtx.realizedEqPct,realizationPct:pfCtx.realizationPct,rangeAdv:pfCtx.rangeAdv,nutAdv:pfCtx.nutAdv,comment,suggest:''};
    }
    if(isIPRiverNutCheck){
      const svr=suggestBet(pot,eq,d.street);
      comment+=' 【高頻度ベット推奨】IPリバーでナッツハンドをチェックバック。相手がチェックした後のナッツは、推定上ほぼベット側に寄ります。バリューを最大化するためにベットすべき局面です。チェックバックするとショーダウン時のみバリューが発生し、ポット獲得額が大幅に減少します。';
      return{...sc,rawEqPct:pfCtx.rawEqPct,effectiveEqPct:pfCtx.realizedEqPct,realizationPct:pfCtx.realizationPct,rangeAdv:pfCtx.rangeAdv,nutAdv:pfCtx.nutAdv,comment,suggest:formatBetSuggestion('推奨ベット: ',svr,d)};
    }
    if(isIPTurnNutCheck){
      const svt=suggestBet(pot,eq,d.street);
      comment+=' 【高頻度ベット推奨】IPターンでナッツハンドをチェックバック。相手にフリーカードを与えフラッシュ/ストレート等の逆転を許します。ターンでバリューベットしてポットを育て、リバーの最大化につなげるのが自然です。';
      return{...sc,rawEqPct:pfCtx.rawEqPct,effectiveEqPct:pfCtx.realizedEqPct,realizationPct:pfCtx.realizationPct,rangeAdv:pfCtx.rangeAdv,nutAdv:pfCtx.nutAdv,comment,suggest:formatBetSuggestion('推奨ベット: ',svt,d)};
    }
    {
      const _evLblCk=sc.evLoss==='significant'?'【大幅EV損失】':sc.evLoss==='moderate'?'【中程度EV損失】':'【EV損失（微差）】';
      const _3bNtCk=(is3BetPotCk&&humanWas3BetterCk&&d.street==='flop')?' ※3BETポット: レンジアドバンテージあり — CBet頻度が通常より高い局面です。':'';
      const _blkNtCk=(_blkCk.nutFlushBlock&&(role.role==='air'||role.role==='draw'))?' ※A'+_blkCk.flushBlockSuit+'ブロッカー保持: セミブラフ性質を持つ。':'';
      if(isStrongHand){
        comment+=' '+_evLblCk+'強いハンドをチェックするのはEV損失があります。積極的なベットが推奨されます（推定bet率約'+Math.round(betProb*100)+'%）。'+mwNote+topPairRiverNote+pairedBoardNote+_3bNtCk;
      }else{
        comment+=' '+_evLblCk+'この局面でのチェックは期待値損失があります（推定bet率約'+Math.round(betProb*100)+'%）。'+mwNote+topPairRiverNote+pairedBoardNote+_3bNtCk+_blkNtCk;
      }
      const suggest=checkBetPlan();
      return{...sc,rawEqPct:pfCtx.rawEqPct,effectiveEqPct:pfCtx.realizedEqPct,realizationPct:pfCtx.realizationPct,rangeAdv:pfCtx.rangeAdv,nutAdv:pfCtx.nutAdv,comment,suggest:pot>0?formatBetSuggestion('推奨ベット: ',suggest,d):''};
    }
  }
  return{...sc,rawEqPct:pfCtx.rawEqPct,effectiveEqPct:pfCtx.realizedEqPct,realizationPct:pfCtx.realizationPct,rangeAdv:pfCtx.rangeAdv,nutAdv:pfCtx.nutAdv,comment,suggest:''};
}

function evalCall(d,hr,human,nOpponents){
  const hc=human.holeCards;
  if(!hc||hc.length<2)return{quality:'ok',deduction:0,comment:'コール。'};
  const commLen={flop:3,turn:4,river:5}[d.street]||3;
  const comm=hr.community.slice(0,commLen);
  const adj=oppRangeAdj(hr,d.street);
  const eq=estimateEquity(hc,comm,nOpponents,2000)*adj;
  const po=d.potOdds||0;
  const eqPct=Math.round(eq*100);
  const poPct=Math.round(po*100);
  const tex=boardTex(comm);
  const evalRes=hc.length&&comm.length>=3?HandEval.evaluate([...hc,...comm]):null;
  const role=evalRes?handRole(hc,comm,evalRes):{role:'unknown',note:'',isNut:false,isVuln:false};
  const sw=STREET_W[d.street]||1.0;
  const adjNote=adj<1.0?' （相手の連続ベットでレンジ補正×'+Math.round(adj*100)+'%）':'';

  // [Codex fix 2026-05-30] call時のd.potは相手ベット後。ベットサイズ比は「コール額 / ベット前ポット」で見る。
  const betBasePot=d.toCall>0?Math.max(1,(d.pot||0)-d.toCall):(d.pot||0);
  const betToPotRatio=betBasePot>0?d.toCall/betBasePot:0.5;
  const pressure=riverShowdownPressure(hr,d,role,nOpponents,betToPotRatio);
  const streetPressure=streetBettingPressure(hr,d,role,betToPotRatio,comm);
  const madeRisk=riverMadeHandRisk(hc,comm,evalRes,role);
  // [Claude fix 2026-06-09] evalFoldと同様にOOP/マルチウェイ/ハンドロール実現率をコール評価にも適用
  // コールした場合の実効EQ = RawEQ × 実現率。postflopContextと同じ係数を使う。
  const posStateCall=postflopPositionState(hr,d);
  const isOOPCall=posStateCall.isOOP;
  const limpIsoCall=limpIsoCallContext(hr).isLimpIsoCall;
  let realizationCall=1.0;
  if(isOOPCall)realizationCall*=0.82;
  if(limpIsoCall)realizationCall*=0.88;
  if(nOpponents>=3)realizationCall*=0.62;
  else if(nOpponents>=2)realizationCall*=0.72;
  if(role.role==='air')realizationCall*=0.72;
  else if(role.role==='medium'||role.pairTier==='board_pair')realizationCall*=0.82;
  else if(role.role==='draw')realizationCall*=0.92;
  else if(role.role==='strong'||role.role==='nutted')realizationCall*=1.05;
  if(role.draw&&role.draw.outs>=8&&d.street!=='river')realizationCall*=1.10;
  realizationCall=Math.max(0.35,Math.min(1.08,realizationCall));
  // [fix 2026-06-10] リバーは残りカードが無く実現率の概念がない（EQ=ショーダウン勝率）。レンジ補正はpressure/streetPressureで別途実施。
  if(d.street==='river')realizationCall=1.0;
  const effEq=eq*realizationCall*pressure.factor*streetPressure.factor*madeRisk.factor;
  const effEqPct=Math.round(effEq*100);
  const effNote=(realizationCall<0.95||pressure.factor<0.98||streetPressure.factor<0.98||madeRisk.factor<0.98)?' 実効EQ約'+effEqPct+'%（生EQ '+eqPct+'%、実現率補正後）として評価。':'';
  const evDiff=effEq-po; // EV差: プラスならコール正解
  const evDiffAbs=Math.abs(evDiff);

  // ---- 4フラッシュボード自分フラッシュなし + 大ベットコール検出 ----
  let fourFlushCallNote='';
  {
    const suitCntCall={};
    comm.forEach(c=>{suitCntCall[c.suit]=(suitCntCall[c.suit]||0)+1;});
    const has4FlushBoard=Object.values(suitCntCall).some(v=>v>=4);
    const allCards7=[...hc,...comm];
    const suitCnt7={};
    allCards7.forEach(c=>{suitCnt7[c.suit]=(suitCnt7[c.suit]||0)+1;});
    const hasMyFlushCall=Object.values(suitCnt7).some(v=>v>=5);
    if(has4FlushBoard&&!hasMyFlushCall&&po>=0.30){
      fourFlushCallNote=' 【4フラッシュボード注意】ボードに同スーツが4枚あり、自分はフラッシュ未完成。相手のベットレンジはフラッシュ完成ハンドが多く含まれます。フラッシュなしでの大ベットコールは慎重に検討してください。';
    }
  }
  if(evDiff>=0.15){
    return{quality:'good',deduction:0,rawEqPct:eqPct,effectiveEqPct:effEqPct,comment:'正解。コール（EQ約'+eqPct+'%、必要'+poPct+'%）'+adjNote+pressure.note+streetPressure.note+madeRisk.note+effNote+fourFlushCallNote+'。'+role.note+' EV優位（+'+Math.round(evDiff*100)+'%）で明確なコールです。'};
  }
  if(evDiff>=0.05){
    return{quality:'good',deduction:Math.round(2*sw),rawEqPct:eqPct,effectiveEqPct:effEqPct,comment:'正解。コール（EQ約'+eqPct+'%、必要'+poPct+'%）'+adjNote+pressure.note+streetPressure.note+madeRisk.note+effNote+fourFlushCallNote+'。'+role.note+' 若干のEV優位。'};
  }
  if(evDiff>=-0.05){
    return{quality:'ok',deduction:0,rawEqPct:eqPct,effectiveEqPct:effEqPct,comment:'コール（EQ約'+eqPct+'%、必要'+poPct+'%）'+adjNote+pressure.note+streetPressure.note+madeRisk.note+effNote+fourFlushCallNote+'。'+role.note+' ボーダーラインのコール。EV差が小さく（'+Math.round(evDiff*100)+'%）、コール/フォールドどちらも許容内です。',isMix:true};
  }
  if(evDiff>=-0.12){
    return{quality:'ok',deduction:Math.round(8*sw),rawEqPct:eqPct,effectiveEqPct:effEqPct,comment:'やや損なコール（EQ約'+eqPct+'%、必要'+poPct+'%）'+adjNote+pressure.note+streetPressure.note+madeRisk.note+effNote+fourFlushCallNote+'。'+role.note+' EV微損（'+Math.round(evDiff*100)+'%）。',suggest:'推奨: フォールドが若干有利'};
  }
  if(evDiff>=-0.22){
    return{quality:'bad',deduction:Math.round(18*sw),rawEqPct:eqPct,effectiveEqPct:effEqPct,comment:'【EV損失】コール（EQ約'+eqPct+'%、必要'+poPct+'%）'+adjNote+pressure.note+streetPressure.note+madeRisk.note+effNote+fourFlushCallNote+'。'+role.note+' EV損失（'+Math.round(evDiff*100)+'%）で基本的にはフォールドすべき局面。',suggest:'推奨: フォールド'};
  }
  return{quality:'bad',deduction:Math.round(28*sw),rawEqPct:eqPct,effectiveEqPct:effEqPct,comment:'【大きなEV損失】コール（EQ約'+eqPct+'%、必要'+poPct+'%）'+adjNote+pressure.note+streetPressure.note+madeRisk.note+effNote+fourFlushCallNote+'。EV損失'+Math.round(evDiff*100)+'%。明確なフォールドスポット。',suggest:'推奨: フォールド'};
}

function evalFold(d,hr,human,nOpponents){
  const hc=human.holeCards;
  if(!hc||hc.length<2)return{quality:'ok',deduction:0,comment:'フォールド。'};
  const commLen={flop:3,turn:4,river:5}[d.street]||3;
  const comm=hr.community.slice(0,commLen);
  const adj=oppRangeAdj(hr,d.street);
  const eq=estimateEquity(hc,comm,nOpponents,2000)*adj;
  const po=d.potOdds||0;
  const eqPct=Math.round(eq*100);
  const poPct=Math.round(po*100);
  const evalRes=hc.length&&comm.length>=3?HandEval.evaluate([...hc,...comm]):null;
  const role=evalRes?handRole(hc,comm,evalRes):{role:'unknown',note:'',isNut:false,isVuln:false};
  const sw=STREET_W[d.street]||1.0;
  const adjNote=adj<1.0?' （レンジ補正後）':'';

  // [Claude fix 2026-06-09] OOP/マルチウェイ/ハンドロール実現率をフォールド評価に組み込む
  // postflopContextと同じ係数: コールした場合の実効EQを正確に算出する
  const betBasePot=d.toCall>0?Math.max(1,(d.pot||0)-d.toCall):(d.pot||0);
  const betToPotRatio=betBasePot>0?d.toCall/betBasePot:0.5;
  const posStateFold=postflopPositionState(hr,d);
  const isOOPFold=posStateFold.isOOP;
  const limpIsoFold=limpIsoCallContext(hr).isLimpIsoCall;
  let foldRealizeAdj=1.0;
  if(isOOPFold)foldRealizeAdj*=0.82;
  if(limpIsoFold)foldRealizeAdj*=0.88;
  if(nOpponents>=3)foldRealizeAdj*=0.62;
  else if(nOpponents>=2)foldRealizeAdj*=0.72;
  if(role.role==='air')foldRealizeAdj*=0.72;
  else if(role.role==='medium'||role.pairTier==='board_pair')foldRealizeAdj*=0.82;
  else if(role.role==='draw')foldRealizeAdj*=0.92;
  else if(role.role==='strong'||role.role==='nutted')foldRealizeAdj*=1.05;
  if(role.draw&&role.draw.outs>=8&&d.street!=='river')foldRealizeAdj*=1.10;
  foldRealizeAdj=Math.max(0.35,Math.min(1.08,foldRealizeAdj));
  // [fix 2026-06-10] リバーは実現率補正を無効化（以降のレンジ系補正mwRiverOvercall等はそのまま適用）。
  if(d.street==='river')foldRealizeAdj=1.0;
  const pressure=riverShowdownPressure(hr,d,role,nOpponents,betToPotRatio);
  const streetPressure=streetBettingPressure(hr,d,role,betToPotRatio,comm);
  // ---- マルチウェイリバー bet+コール構造: 実効EQ大幅補正 ----
  // bet+callが入ると: ベッターはバリュー寄り、オーバーコーラーは超強レンジのみ残る
  // 両方に勝つ必要があるため実効EQは生EQの40〜50%程度まで下落
  let mwRiverOvercallNote='';
  if(d.street==='river'&&nOpponents>=2){
    const myIdx=hr.decisions.findIndex(function(d2){return d2===d;});
    const priorSt=hr.decisions.slice(0,myIdx).filter(function(d2){return d2.street===d.street&&!d2.isHuman;});
    const priorBets=priorSt.filter(function(d2){return d2.action==='raise'||d2.action==='allin';});
    const priorCalls=priorSt.filter(function(d2){return d2.action==='call';});
    if(priorBets.length>=1&&priorCalls.length>=1){
      // bet+call構造: ベッター×オーバーコーラー双方に勝つ必要がある
      foldRealizeAdj*=0.42; // 実効EQを42%に圧縮
      mwRiverOvercallNote=' 【マルチウェイリバー: bet+call構造】ベッターのレンジ＋オーバーコーラーの超強レンジ（コールしてさらに相手が残る状況では極端にバリュー偏重）に同時勝つ必要があり、実効EQは大幅低下。さらにポピュレーションはこの構造でのブラフ頻度が激減する。フォールドが実戦上は正解に近い。';
    }
  }
  // ---- 強いドロー（NFD/OESD）への過剰フォールド検出 ----
  const evalResFd=hc.length&&comm.length>=3?HandEval.evaluate([...hc,...comm]):null;
  const roleFd=evalResFd?handRole(hc,comm,evalResFd):{role:'unknown',draw:null};
  let strongDrawFoldNote='';
  if(roleFd.role==='draw'&&roleFd.draw){
    const dr=roleFd.draw;
    const isStrongDraw=dr.flush||dr.oesd||(dr.flush&&dr.straight);
    const isSmallBet=betToPotRatio<=0.40;
    const isMedBet=betToPotRatio<=0.60;
    if(isStrongDraw&&isSmallBet){
      foldRealizeAdj*=0.70;
      strongDrawFoldNote=' 【高頻度コール推奨】'+(dr.flush&&dr.straight?'フラッシュ+ストレートドロー（超強力）':dr.flush?'フラッシュドロー':'ストレートドロー')+'で小さなベット（'+Math.round(betToPotRatio*100)+'%pot）にフォールド。約'+(dr.flush&&dr.straight?'45':dr.flush||dr.oesd?'35':'20')+'%のEQがありポットオッズ的に明確なコールスポット。フォールドは大きなEV損失です。';
    }else if(isStrongDraw&&isMedBet){
      foldRealizeAdj*=0.88;
      strongDrawFoldNote=' 【注意】'+(dr.flush?'フラッシュドロー':'ストレートドロー')+'での中程度ベット（'+Math.round(betToPotRatio*100)+'%pot）へのフォールド。ポットオッズを計算した上でのコール検討を推奨します。';
    }
  }
  // ---- フルハウス以上 / セット / フラッシュ vs 大きなオールイン ----
  let strongHandFoldNote='';
  if(evalResFd&&d.toCall>0){
    const cat=evalResFd.cat;
    const allInRatio=d.pot>0?d.toCall/d.pot:0;
    if(cat>=6){
      foldRealizeAdj*=0.15;
      strongHandFoldNote=' 【重大ミス】フルハウス以上の手でフォールド。原則としてコール側に大きく寄る局面です。フルハウス以上が負けるシナリオはクアッズ/ストレートフラッシュの極めてレアなケースのみ。';
    }else if(cat===3&&allInRatio>=0.5){
      strongHandFoldNote=' 【高頻度コール推奨】セット/トリップス系の手での大ベットへのフォールド。セットは大半の状況で十分なEQがあります。';
    }else if(cat===5&&allInRatio>=0.5&&!(roleFd.isVuln&&!roleFd.isNut)){
      strongHandFoldNote=' 【高頻度コール推奨】フラッシュでの大ベットへのフォールド。フラッシュはほとんどの状況でコールに十分なEQがあります。';
    }
  }
  const madeRiskFold=riverMadeHandRisk(hc,comm,evalResFd,roleFd);
  const adjEqFold=eq*foldRealizeAdj*pressure.factor*streetPressure.factor*madeRiskFold.factor;
  const effEqPct=Math.round(adjEqFold*100);
  // [Claude fix 2026-06-09] foldRealizeAdj < 0.95 のときも実効EQを表示（OOP/マルチウェイ補正が入った場合）
  const effNote=(foldRealizeAdj<0.95||pressure.factor<0.98||streetPressure.factor<0.98||madeRiskFold.factor<0.98)?' 実効EQ約'+effEqPct+'%（生EQ '+eqPct+'%、実現率補正後）として評価。':'';
  const evDiff=adjEqFold-po;

  if(evDiff<=-0.10){
    return{quality:'good',deduction:0,rawEqPct:eqPct,effectiveEqPct:effEqPct,comment:'正解。フォールド（EQ約'+eqPct+'%、必要'+poPct+'%）'+adjNote+pressure.note+streetPressure.note+madeRiskFold.note+effNote+mwRiverOvercallNote+strongDrawFoldNote+'。'+role.note+' EV的に明確なフォールドです。'};
  }
  if(evDiff<0.05){
    return{quality:'good',deduction:Math.round(2*sw),rawEqPct:eqPct,effectiveEqPct:effEqPct,comment:'正解。フォールド（EQ約'+eqPct+'%、必要'+poPct+'%）'+adjNote+pressure.note+streetPressure.note+madeRiskFold.note+effNote+mwRiverOvercallNote+strongDrawFoldNote+'。'+role.note+' ボーダーラインですがフォールドが有力。'};
  }
  if(evDiff<0.12){
    return{quality:'ok',deduction:0,isMix:true,rawEqPct:eqPct,effectiveEqPct:effEqPct,comment:'フォールド（EQ約'+eqPct+'%、必要'+poPct+'%）'+adjNote+pressure.note+streetPressure.note+madeRiskFold.note+effNote+mwRiverOvercallNote+strongDrawFoldNote+strongHandFoldNote+'。'+role.note+' コールとフォールドの混合戦略。EV差小（'+Math.round(evDiff*100)+'%）でフォールドも許容内。',suggest:'コールも検討: EQ差 +'+Math.round(evDiff*100)+'%'};
  }
  if(evDiff<0.22){
    return{quality:'bad',deduction:Math.round(18*sw),rawEqPct:eqPct,effectiveEqPct:effEqPct,comment:'【EV損失】フォールド（EQ約'+eqPct+'%、必要'+poPct+'%）'+adjNote+pressure.note+streetPressure.note+madeRiskFold.note+effNote+strongDrawFoldNote+strongHandFoldNote+'。'+role.note+' EV損失あり（+'+Math.round(evDiff*100)+'%の優位をフォールド）。',suggest:'推奨: コール（必要EQ '+poPct+'% に対し実効EQ'+effEqPct+'%）'};
  }
  return{quality:'bad',deduction:Math.round(Math.max(28,evDiff>0.35?35:28)*sw),rawEqPct:eqPct,effectiveEqPct:effEqPct,comment:'【大きなEV損失】フォールド（EQ約'+eqPct+'%、必要'+poPct+'%）'+adjNote+pressure.note+streetPressure.note+madeRiskFold.note+effNote+strongDrawFoldNote+strongHandFoldNote+'。EV損失'+Math.round(evDiff*100)+'%。明確なコールスポット。',suggest:'推奨: コール'};
}

function evalBet(d,hr,human,nOpponents){
  const hc=human.holeCards;
  if(!hc||hc.length<2)return{quality:'ok',deduction:0,comment:'ベット。'};
  const commLen={flop:3,turn:4,river:5}[d.street]||3;
  const comm=hr.community.slice(0,commLen);
  const adj=oppRangeAdj(hr,d.street);
  const eq=estimateEquity(hc,comm,nOpponents,2000)*adj;
  const pot=d.pot||0;
  const betAmt=d.amount||0;
  const betPct=pot>0?Math.round(betAmt/pot*100):0;
  const evalRes=hc.length&&comm.length>=3?HandEval.evaluate([...hc,...comm]):null;
  const role=evalRes?handRole(hc,comm,evalRes):{role:'unknown',note:'',isNut:false,isVuln:false};
  const tex=boardTex(comm);
  const prevCommLenB={flop:0,turn:3,river:4}[d.street]||0;
  const boardTextureB=comm.length>=3?boardTextureProfile(comm,d.street,prevCommLenB?hr.community.slice(0,prevCommLenB):[]):null;
  const isHU=nOpponents===1;
  const eqPct=Math.round(eq*100);
  const sw=STREET_W[d.street]||1.0;
  const isRiver=d.street==='river';
  const isStrong=role.role==='strong'||role.role==='nutted';
  // [Codex fix 2026-05-26] ミドルペア+OESD/FDを弱いワンペア単体として罰しない。
  const madeStrongDrawBet=!!(role.draw&&role.draw.outs>=8&&!isRiver);

  // ---- ストリート圧力連鎖検出 ----
  const prevBetFlop=hr.decisions.some(d2=>d2.isHuman&&(d2.action==='raise'||d2.action==='allin')&&d2.street==='flop');
  const prevBetTurn=hr.decisions.some(d2=>d2.isHuman&&(d2.action==='raise'||d2.action==='allin')&&d2.street==='turn');
  const is3barrel=isRiver&&prevBetFlop&&prevBetTurn;
  const is2barrel=d.street==='turn'&&prevBetFlop;
  // ---- 3-betポット検出 ----
  const _pfRaisesB=hr.decisions.filter(d2=>d2.street==='preflop'&&(d2.action==='raise'||d2.action==='allin'));
  const lastPfrB=_pfRaisesB[_pfRaisesB.length-1]||null;
  const humanWasPfrB=humanWasLastPreflopAggressor(hr);
  const is3BetPotB=_pfRaisesB.length>=2;
  const humanWas3BetterB=is3BetPotB&&hr.decisions.some(d2=>d2.street==='preflop'&&d2.isHuman&&(d2.action==='raise'||d2.action==='allin')&&d2.facingRaise);
  // ---- ブロッカー検出 ----
  const _blkB=(function(){
    const _suitCnt={};comm.forEach(c=>{_suitCnt[c.suit]=(_suitCnt[c.suit]||0)+1;});
    const _fSuits=Object.entries(_suitCnt).filter(function(e){return e[1]>=3;}).map(function(e){return e[0];});
    let _nfb=false,_fbs=null;
    hc.forEach(function(c){if(RANK_VAL[c.rank]===14&&_fSuits.includes(c.suit)){_nfb=true;_fbs=c.suit;}});
    return{nutFlushBlock:_nfb,flushBlockSuit:_fbs};
  })();

  // ---- ヴィランチェック後のIPベット検出 ----
  // d.toCall===0 かつ、このストリートで相手が先にチェックしている場合
  const myDecIdx=hr.decisions.findIndex(d2=>d2===d);
  const villainCheckedPrior=myDecIdx>0&&hr.decisions.slice(0,myDecIdx).some(
    d2=>d2.street===d.street&&!d2.isHuman&&d2.action==='check'
  );
  const inPosCheck=d.toCall===0&&villainCheckedPrior;

  // IP判定: COでもBTNに対してはOOPになりうるため、実際の行動順で見る。
  const posStateBet=postflopPositionState(hr,d);
  const isIPbet=posStateBet.isIP;
  // ソルバーがベットする確率 → ベットの頻度（inPosCheck・IP補正付き）
  let betProb=solverBetProb(eq,d.street,role,tex,isHU,inPosCheck,isIPbet,nOpponents);
  // 3-betポット レンジ/ナッツアドバンテージ補正
  if(is3BetPotB&&humanWas3BetterB&&humanWasPfrB&&d.street==='flop'){betProb=Math.min(0.90,betProb*1.38);}
  else if(is3BetPotB&&humanWas3BetterB&&humanWasPfrB&&d.street==='turn'&&!prevBetFlop){betProb=Math.min(0.80,betProb*1.18);}
  const limpIsoBet=limpIsoCallContext(hr).isLimpIsoCall;
  if(limpIsoBet&&!isIPbet&&!humanWasPfrB&&d.toCall===0){
    betProb*=0.72;
  }
  const textureFreqB=boardTextureFrequencyAdjustment(betProb,boardTextureB,{street:d.street,role,isPfr:humanWasPfrB,isIP:isIPbet,nOpponents});
  betProb=textureFreqB.betProb;
  let sc=freqToDeduction(betProb,d.street);
  sc={...sc,boardTextureMixProfile:textureFreqB};
  // [Codex fix 2026-05-26] HUのペア+強ドローは、純粋なミドルペアベットより許容幅を広く取る。
  if(madeStrongDrawBet&&nOpponents<=1&&sc.quality==='bad'&&sc.deduction<=Math.round(18*sw)){
    sc={...sc,quality:'ok',deduction:0,isMix:true,evLoss:'mix'};
  }

  // ---- マルチウェイ大ブラフ検出 (3way以上 × エアー × 大サイズ) ----
  if(nOpponents>=2&&role.role==='air'&&betPct>=50&&!isRiver){
    const mwBluffDed=nOpponents>=3?Math.round(20*(STREET_W[d.street]||1.0)):Math.round(12*(STREET_W[d.street]||1.0));
    const mwBluffLabel=(nOpponents+1)+'way';
    const mwBluffNote=nOpponents>=3
      ?'【原則NG】'+mwBluffLabel+'のマルチウェイで大きなブラフ（'+betPct+'%pot）。'+nOpponents+'人が残っており誰か1人以上がコールする確率が非常に高く、ブラフ成功率が激減。マルチウェイではエアーのブラフ頻度は大きく下がります。'
      :'【注意】マルチウェイ（'+mwBluffLabel+'）での'+betPct+'%potブラフ。2人に同時に通す必要があり成功率が大幅低下。';
    if(sc.deduction<mwBluffDed)sc={...sc,quality:'bad',deduction:mwBluffDed};
    sc={...sc,suggest:'推奨: チェック'};
    if(!(sc.comment||'').includes('原則NG'))sc={...sc,comment:(sc.comment||'')+mwBluffNote};
  }
  // ---- 初心者のOOPリード/ドンク検出 ----
  const oopLead=posStateBet.isOOP&&d.toCall===0&&!isRiver&&!humanWasPfrB;
  if(oopLead&&!madeStrongDrawBet&&(role.role==='air'||role.role==='medium'||role.pairTier==='board_pair')&&betPct>=25){
    const donkDed=Math.round((role.role==='air'?14:12)*(STREET_W[d.street]||1.0));
    const donkNote=' 【初心者リーク】OOPからの弱いリードベット（'+betPct+'%pot）。プリフロップ主導権がない側のドンクは、強い根拠がないとレンジ全体で不利になりやすい。特にエアー/弱いペア/ボードペア依存ではチェックでレンジを守るのが基本です。';
    if(sc.deduction<donkDed)sc={...sc,quality:'bad',deduction:donkDed};
    sc={...sc,suggest:'推奨: チェック'};
    if(!(sc.comment||'').includes('OOPからの弱いリード'))sc={...sc,comment:(sc.comment||'')+donkNote};
  }
  // ---- エアーのリバーオーバーベット検出 (100%pot以上) ----
  if(isRiver&&role.role==='air'&&betPct>=100){
    const airRivDed=Math.round(22*(STREET_W[d.street]||1.0));
    const airRivNote=' 【原則NG】エアーでのリバーオーバーベット（'+betPct+'%pot）。大きなブラフはフォールドEQが高い局面では有効ですが、コールされた際の損失も最大になります。ブラフサイズは通常55〜75%potで頻度を管理し、100%pot超のエアーブラフは正当化が難しい。';
    if(sc.deduction<airRivDed)sc={...sc,quality:'bad',deduction:airRivDed};
    sc={...sc,suggest:'推奨: チェック or 小サイズ（55〜75%pot）'};
    if(!(sc.comment||'').includes('リバーオーバーベット'))sc={...sc,comment:(sc.comment||'')+airRivNote};
  }else if(isRiver&&role.role==='air'&&betPct>=40){
    const hasNutBlocker=_blkB.nutFlushBlock;
    const airRivDed=Math.round((hasNutBlocker?10:14)*(STREET_W[d.street]||1.0));
    const airRivNote=' 【初心者リーク】エアーでのリバーブラフ（'+betPct+'%pot）。GTOでは一部のブロッカー付きブラフは存在しますが、初心者が根拠なく打つとコールされた時にほぼ負けます。ブラフ候補はナッツブロッカーや相手レンジを降ろせる明確な理由がある手に絞りましょう。';
    if(sc.deduction<airRivDed)sc={...sc,quality:hasNutBlocker?'ok':'bad',deduction:airRivDed};
    sc={...sc,suggest:'推奨: チェック'};
    if(!(sc.comment||'').includes('初心者リーク'))sc={...sc,comment:(sc.comment||'')+airRivNote};
  }
  // 強いハンド or IP-after-check の'ok'ゾーンは減点を60%に緩和
  if(sc.quality==='ok'&&sc.deduction>0&&(isStrong||inPosCheck)){
    sc={...sc,deduction:Math.round(sc.deduction*0.6)};
  }
  // ---- リバーでの弱いワンペアベット: 典型的な初心者ミス ----
  // リバーで相手がコールするとき、あなたの手より強いハンドしかコールしない（valueとしてNG）。
  // かつ相手が弱い手なら自動的に降りる（bluffとしてもNG）。完全にデッドゾーン。
  if(isRiver&&betAmt>0&&role.role==='medium'){
    const wpBig=betPct>=75;
    const wpMid=betPct>=40&&betPct<75;
    const wpPenaltyBase=wpBig?15:wpMid?10:5;
    const extraMW=nOpponents>=2?Math.round(wpPenaltyBase*0.5):0;
    const totalWP=wpPenaltyBase+extraMW;
    if(sc.deduction<totalWP){sc={...sc,quality:'bad',deduction:totalWP};}
    const wpNote='【初心者典型ミス】弱いワンペア/ミドルペアでのリバーベット（'+betPct+'%pot）。'
      +'リバーでコールする相手は必ずあなたより強い手（バリューとして機能しない）。'
      +'弱い相手は勝手に降りる（ブラフとしても機能しない）。'+(nOpponents>=2?' マルチウェイでは更に悪化。':'')
      +'チェックしてショーダウンバリューを活かすのが正解です。';
    sc={...sc,comment:wpNote,suggest:'推奨: チェック（ショーダウンバリューを活かす）'};
  }
  // ミディアムペアのベット: 完全なエアーほど悪くないので上限を緩和
  if(sc.quality==='bad'&&role.role==='medium'&&!madeStrongDrawBet){
    const sw7=STREET_W[d.street]||1.0;
    sc={...sc,deduction:Math.min(sc.deduction,Math.round(25*sw7))};
  }
  // [Codex fix 2026-05-26] ペアボード上のAハイフラッシュは全体ナッツではないため、リバー巨大レイズ/オールインを過大評価しない。
  if(isRiver&&betPct>=100&&role.nutFlush&&role.isVuln&&!role.isNut){
    const nfDed=betPct>=130?12:8;
    if((sc.deduction||0)<nfDed)sc={...sc,quality:nfDed>=12?'bad':'ok',deduction:nfDed};
    const nfNote=' 【ペアボード注意】Aハイフラッシュですが、ボードがペアっているため全体ナッツではありません。相手の大きいベットに対するオーバーベット/オールインは、下フラッシュから取れる一方でフルハウスにだけ強くコールされやすい薄いバリューです。ライブ$2/$5ではコール、または小さめレイズに寄せる方が実戦的です。';
    sc={...sc,comment:(sc.comment||'')+nfNote,suggest:'推奨: コール寄り。レイズするなら小さめ（2.2〜2.8倍）'};
  }

  // 理想サイズ計算
  let ideal=suggestBet(pot,eq,d.street);
  const textureSizePlanB=boardTextureSizePlan(pot,boardTextureB,role,{street:d.street,isPfr:humanWasPfrB,isIP:isIPbet,nOpponents,preferredSizePct:textureFreqB&&textureFreqB.preferredSizePct});
  if(textureSizePlanB)ideal=textureSizePlanB;
  if(textureSizePlanB)sc={...sc,boardTextureSizeProfile:textureSizePlanB};
  const madeRiskBet=riverMadeHandRisk(hc,comm,evalRes,role);
  const cautiousRiverBet=isRiver&&madeRiskBet.vulnerableValue&&!role.isNut;
  const topPairRiverBet=isRiver&&!role.isNut&&(role.pairTier==='top_pair'||role.pairTier==='overpair')&&(role.role==='strong'||role.role==='value');
  if(madeStrongDrawBet&&pot>0){
    // [Codex fix 2026-05-26] ペア+強ドローのセミブラフはEQだけで大きくしすぎず、フロップは小〜中サイズを許容。
    const pct=d.street==='flop'?40:55;
    ideal={pct,amt:Math.round(pot*pct/100)};
  }else if(cautiousRiverBet&&pot>0){
    const pct=role.role==='strong'?55:45;
    ideal={pct,amt:Math.round(pot*pct/100)};
  }else if(topPairRiverBet&&pot>0){
    const pct=(tex.dynamic||tex.flushy>=3||tex.paired)?45:55;
    ideal={pct,amt:Math.round(pot*pct/100)};
  }
  const cautiousOnePairPlanB=cautiousOnePairBetPlan(pot,d,role,tex,isIPbet);
  if(cautiousOnePairPlanB)ideal=cautiousOnePairPlanB;
  let sizeNote='';
  let sizePenalty=0;
  if(betAmt>0&&pot>0){
    const sizeDiff=Math.abs(betPct-ideal.pct);
    if(sizeDiff<=10)sizeNote=' サイズ'+betAmt+'T'+'（'+betPct+'%pot）は適切。';
    else if(betPct<ideal.pct*0.6)sizeNote=' サイズ'+betAmt+'T'+'（'+betPct+'%pot）はやや小さめ（推奨:'+ideal.pct+'%pot）。';
    else if(!isRiver&&betPct>=100&&!role.isNut){
      // フロップ/ターンでのPOT以上ベット（ナッツ以外）: 定石外の典型的初心者ミス
      const flopTurnLabel=d.street==='flop'?'フロップ':'ターン';
      const nbRole=role.role;
      const isMedOrWorse=(nbRole==='medium'||nbRole==='air');
      if(isMedOrWorse){
        sizeNote=' 【定石外オーバーベット】'+flopTurnLabel+'でのポットオーバー（'+betPct+'%pot）は定石から外れた大きなサイズです。'+(nbRole==='medium'?'ワンペア等の中程度ハンドには30〜50%potが推奨。大サイズはナッツ級でのみ正当化されます。':'ブラフ/エアーでのオーバーベットはコールされたとき大きく負けます。');
        sizePenalty=betPct>=150?8:5;
      }else{
        sizeNote=' サイズ'+betAmt+'T'+'（'+betPct+'%pot）は'+flopTurnLabel+'でのオーバーベット。バリューハンドでも通常は50〜75%potが推奨。ナッツ確定ハンドまたは特殊テクスチャー以外での'+flopTurnLabel+'POTオーバーは注意。';
        sizePenalty=betPct>=150?4:2;
      }
    }else if(betPct>=100&&!role.isNut&&isRiver){
      // リバーポットベット以上かつナッツでない場合
      const pairedNutFlush=role.nutFlush&&role.isVuln;
      const thinNote=pairedNutFlush?'Aハイフラッシュですが、ペアボードでは全体ナッツではありません。フルハウスにだけ強くコールされやすく、ライブ$2/$5ではコールか小さめレイズが実戦的です。':cautiousRiverBet?'ペアボード/4フラッシュ等で上位役に当たりやすいため、非ナッツの完成役は小〜中サイズ（'+ideal.pct+'%pot前後）またはチェックを優先。':topPairRiverBet?'トップペア強キッカー/オーバーペアのリバー薄バリューは'+ideal.pct+'%pot前後かチェックを優先。ポット級は相手のコールレンジに強く当たりやすい。':(!role.isNut&&role.role!=='strong')?'ナッツ以外の中程度ハンドには中サイズ（50-65%pot）も検討。':'';
      sizeNote=' サイズ'+betAmt+'T'+'（'+betPct+'%pot）のリバーオーバーベット。'+thinNote;
      sizePenalty=pairedNutFlush?10:cautiousRiverBet?6:topPairRiverBet?5:(is3barrel?2:1);
    }else if(betPct>ideal.pct*1.6&&betPct>100)sizeNote=' サイズ'+betAmt+'T'+'（'+betPct+'%pot）はオーバーベット。強いハンドなら有効な場合も。';
    else if(betPct>ideal.pct*1.4)sizeNote=' サイズ'+betAmt+'T'+'（'+betPct+'%pot）はやや大きめ（推奨:'+ideal.pct+'%pot）。';
    else sizeNote=' サイズ'+betAmt+'T'+'（'+betPct+'%pot）。';
  }
  if(isRiver&&sc.quality==='bad'&&(role.role==='medium'||(role.madeClass==='two_pair'&&role.valueTier!=='top_two_pair'))&&textureSizePlanB&&betAmt>0&&pot>0){
    // [Codex fix 2026-06-26] チェック寄りでも、推奨小サイズに合ったリバー薄ベットは大ミス扱いにしない。
    const alignedTarget=textureSizePlanB&&textureSizePlanB.pct?textureSizePlanB.pct:ideal.pct;
    const alignedSmallBet=Math.abs(betPct-alignedTarget)<=10&&betPct<=45&&betProb>=0.20;
    if(alignedSmallBet)sc={...sc,quality:'ok',deduction:Math.min(sc.deduction||0,8),evLoss:'low'};
  }

  // 3バレル文脈のテキスト
  let barrelNote='';
  if(is3barrel&&isStrong&&!role.isNut){
    // セット・ストレート等の強ハンド: "thin value"ではなくpolar valueとして扱う
    barrelNote=' フロップ・ターン継続後の3バレル。相手のコーリングレンジが絞られているため、サイズ選択が重要です。solverではオーバーベットと中サイズに分散しやすい。';
  }else if(is2barrel&&isStrong&&!role.isNut){
    barrelNote=' ターン連続ベット。ポラライズされたレンジに対してリバーはサイズを合わせて価値を最大化。';
  }

  let comment='ベット '+betAmt+'T'+'（'+betPct+'%pot、EQ約'+eqPct+'%）。'+role.note;

  if(sc.isMix){
    comment+=' GTOソルバーではbet/checkの混合戦略（推定bet率約'+Math.round(betProb*100)+'%）。ベットは合理的な選択です。'+sizeNote+barrelNote;
    return{...sc,deduction:(sc.deduction||0)+sizePenalty,comment,suggest:sizePenalty>0?formatBetSuggestion('推奨サイズ: ',ideal,d):''};
  }
  if(sc.quality==='good'){
    comment+=' ベットが推奨される局面です（推定bet率約'+Math.round(betProb*100)+'%）。'+sizeNote+barrelNote;
    return{...sc,deduction:(sc.deduction||0)+sizePenalty,comment,suggest:sizePenalty>0?formatBetSuggestion('推奨サイズ: ',ideal,d):''};
  }
  if(sc.quality==='ok'){
    if(isStrong){
      comment+=' ベットは合理的な選択。checkも有力な選択肢（推定bet率約'+Math.round(betProb*100)+'%、check率約'+Math.round((1-betProb)*100)+'%）。'+sizeNote+barrelNote;
    }else{
      comment+=' チェックも有力（推定bet率約'+Math.round(betProb*100)+'%）。ベットは許容内ですがEV損失あり。'+sizeNote+barrelNote;
    }
    return{...sc,deduction:(sc.deduction||0)+sizePenalty,comment,suggest:'checkも検討（推定check率'+Math.round((1-betProb)*100)+'%'+(is3barrel?'、中サイズも選択肢':'')+'）'+(sizePenalty>0?' / '+formatBetSuggestion('推奨サイズ: ',ideal,d):'')};
  }
  // bad: ベットすべきでない局面
  {
    const _evLblB=sc.evLoss==='significant'?'【大幅EV損失】':sc.evLoss==='moderate'?'【中程度EV損失】':'【EV損失（微差）】';
    const _3bNoteB=(is3BetPotB&&humanWas3BetterB&&d.street==='flop')?' ※3BETポット: レンジアドバンテージがあるためCBet頻度は通常より高め（それでも非推奨）。':'';
    const _blkNoteB=(_blkB.nutFlushBlock&&role.role==='air')?' ※ナッツフラッシュブロッカー（A'+_blkB.flushBlockSuit+'）保持: フォールドレンジをブロックしており相対的にブラフ向き。ただしEV差が大きい場合は不可。':'';
    comment+=_evLblB+'この局面でのベットは期待値損失があります（推定check率約'+Math.round((1-betProb)*100)+'%）。'+sizeNote+barrelNote+_3bNoteB+_blkNoteB;
    return{...sc,deduction:(sc.deduction||0)+sizePenalty,comment,suggest:sc.suggest||'推奨: チェック'};
  }
}


function analyzeHand(hr){
  const human=hr.players.find(p=>p.isHuman);
  let score=100;const evals=[];
  const nOpponents=hr.players.filter(p=>!p.isHuman&&!p.folded).length||1;

  // FISH_TANK_PREFLOP_CONTEXT_HELPERS_MODULE
  function tournamentPreflopNote(tctx,d,pos,hRank,handFrac){
    if(!tctx||!tctx.enabled)return{note:'',stackBB:null};
    const bb=hr.bigBlind||1;
    const stackBB=Math.max(1,Math.round((d.playerChipsBefore||0)/bb));
    const stealPos=['CO','BTN','SB'].includes(pos);
    const axes=tournamentEvalAxes(tctx,stackBB);
    const anteNote=' 【Tモード】'+tctx.phase+'。BBアンティ込み初期ポットは約'+(1.5+(tctx.bbAnteBB||0)).toFixed(1)+'BBで、リングよりスチール価値が高い。';
    let note=anteNote+' 評価軸は「'+axes.primary+'」。';
    if(d.action==='raise'&&!d.facingRaise){
      const openBB=(d.amount||0)/bb;
      const target=stackBB<=20?'2.0〜2.2BB':stackBB<=30?'2.1〜2.3BB':'2.2〜2.5BB';
      note+=' 有効'+stackBB+'BBではオープン額は'+target+'が基準。現在'+openBB.toFixed(1)+'BB。';
      if(stealPos)note+=' 後ろ寄りポジションはアンティ回収価値が大きく、リングより少し広く攻められます。';
    }else if(d.action==='call'&&d.facingRaise&&pos!=='BB'){
      note+=' 有効'+stackBB+'BBの非BBフラットは慎重に。BBアンティ環境ではポットは大きい一方、SPRが浅くなり、コール後に難しい判断が増えます。3bet jamかフォールドに整理する局面が増えます。';
    }else if(d.action==='fold'&&!d.facingRaise&&stealPos&&stackBB<=25&&handFrac<=0.35){
      note+=' 有効'+stackBB+'BBで後ろ寄りポジション。BBアンティによりスチール価値が高く、リングよりオープン頻度を落としすぎないことが重要です。';
    }else if(d.action==='fold'&&d.facingRaise){
      note+=' 有効'+stackBB+'BB。トーナメントではchipEVだけでなく生存価値もあり、特にバブル寄りではコール側がタイトになります。';
    }else{
      note+=' 有効'+stackBB+'BB。BBアンティで自然にショート化が早く、リングよりポジションと先手の価値が上がります。';
    }
    if(tctx.phase==='バブル')note+=' バブル/チケット目前ではICM圧があり、ミドルスタック同士の薄い衝突は避けます。';
    else if(tctx.phase==='FT')note+=' FTではペイジャンプとスタック順位が大きく、カバーされる薄い受けを避けつつ、カバー側は圧を使います。';
    else if(tctx.phase==='HU')note+=' HUではICM圧が下がり、SB/BTNの参加頻度とBB防衛が大きく広がります。';
    return{note,stackBB,stackBand:axes.stackBand,icmPressure:axes.icmPressure,tournamentAxis:axes.primary,tournamentPhaseAxis:axes.phaseAxis};
  }

  // [Codex fix 2026-05-26] トーナメントの20BB前後は、リングのコール/3BET評価ではなくpush/fold寄りに補正する。
  function tournamentShortStackPreflopAdjust(tctx,d,pos,hRank,handFrac,hcat,isSuited,isPair){
    if(!tctx||!tctx.enabled)return null;
    if(tctx.phase==='HU')return null;
    const bb=hr.bigBlind||1;
    const stackBB=Math.max(1,Math.round((d.playerChipsBefore||((tctx.stackBB||25)*bb))/bb));
    if(stackBB>25)return null;
    const facing=!!(d.facingRaise&&(d.toCall||0)>0);
    const action=d.action;
    const late=['CO','BTN','SB'].includes(pos);
    const raiseLike=action==='raise'||action==='allin';
    const committed=(d.amount||0)>=Math.max(bb*10,(d.playerChipsBefore||0)*0.65);
    const jamLike=action==='allin'||committed;
    const premium=hRank<=12;
    const strong=hRank<=24||hcat==='premium_pair'||hcat==='premium_suited';
    const reshoveCandidate=strong||hcat==='suited_ace'||hcat==='mid_pair'||(isPair&&hRank<=70)||(isSuited&&hRank<=55);
    const bubble=tctx.phase==='バブル';
    let note=' 【20BB前後評価】';
    const out={note:'',deduction:null,quality:null,suggest:null,strategyMix:null};

    if(tctx.phase==='FT'&&action==='call'&&facing&&(d.coverState==='covered'||d.coverState==='mixed_covered')&&((d.amount||d.toCall||0)>=Math.max(bb*10,(d.playerChipsBefore||0)*0.45))){
      out.quality='bad';out.deduction=18;
      out.note=' 【FT評価】ペイジャンプが大きいFTで、カバーされる側が薄いハンドでオールインを受けるのは危険です。BBディフェンスのポットオッズより、負けた時の順位落ちと下位スタックの存在を重く見ます。';
      out.suggest='推奨: フォールド寄り。コールは強いペア/強Ax/明確な相手過剰jam読みがある時だけ';
      out.strategyMix='Fold 80-95% / Call 5-15% / 3bet jam 0-5%';
      return out;
    }

    if(action==='call'&&facing&&bubble&&stackBB<=25){
      note+='バブル/チケット目前のコールはchipEVより通過率への影響を重く見ます。';
      if(premium){
        out.quality='ok';out.deduction=3;
        out.note=note+' プレミアム域は継続できますが、カバーされている時はコール止めよりjamでフォールドエクイティを取る選択も重要です。';
        out.suggest='推奨: コール可。ただし相手とスタック関係次第で3bet jam';
        out.strategyMix='Fold 0-10% / Call 25-45% / 3bet jam 45-70%';
      }else if(pos==='BB'&&(isSuited||isPair||handFrac<=0.38)){
        out.quality='ok';out.deduction=5;
        out.note=note+' BBはポットオッズが良く防衛できますが、バブルでは「安いから見る」だけのコールは危険です。継続するならポストフロップで無理にスタックを入れない前提です。';
        out.suggest='推奨: BBは一部コール可。強く押し返せるハンド以外は慎重に';
        out.strategyMix='Fold 45-70% / Call 20-40% / 3bet jam 5-20%';
      }else{
        out.quality='bad';out.deduction=16;
        out.note=note+' 薄いコールは初心者がチケット目前で落ちやすい典型です。特にカバーされている時は、勝っても少し・負けると致命傷になりやすく、fold/jamの二択へ寄せます。';
        out.suggest='推奨: フォールド。押し返せるブロッカー/ペア/スーテッドAだけ低頻度jam';
        out.strategyMix='Fold 80-95% / Call 0-5% / 3bet jam 5-15%';
      }
      if((d.coverState==='covered'||d.coverState==='mixed_covered')&&out.deduction!=null){
        out.deduction+=4;
        out.note+=' カバーされている状況では、負けた時に即終了しやすいため、この薄いコールはさらに厳しく見ます。';
      }else if((d.coverState==='covering'||d.coverState==='mixed_covering')&&out.note){
        out.note+=' こちらがカバーしている場合は相手に圧をかけられますが、それでもコールで受けるよりjam/foldの方がテーマに合います。';
      }
      return out;
    }

    if(action==='call'&&facing&&pos!=='BB'&&stackBB<=20){
      note+='有効'+stackBB+'BBの非BBフラットは、リングより価値が落ちます。コール後SPRが浅く、後続のスクイーズやポストフロップの難問が増えるため、3bet jam / fold に整理するのが基本です。';
      if(premium){
        out.quality='ok';out.deduction=4;
        out.note=note+'強ハンドはコールで隠すより、reshoveでフォールドエクイティとバリューを取りに行く頻度が高くなります。';
        out.suggest='推奨: 3bet jam高頻度。スロー寄りコールは低頻度';
        out.strategyMix='Fold 0% / Call 10-25% / 3bet jam 75-90%';
      }else if(reshoveCandidate&&handFrac<=0.42){
        out.quality='ok';out.deduction=6;
        out.note=note+'参加するならコールよりreshove寄り。特にスーテッドA・中小ペア・強いスーテッド系は、実現率よりフォールドエクイティを使う局面です。';
        out.suggest='推奨: 3bet jamまたはフォールド。フラットは低頻度';
        out.strategyMix='Fold 45-65% / Call 5-15% / 3bet jam 25-45%';
      }else{
        out.quality='bad';out.deduction=14;
        out.note=note+'弱い/ドミネートされやすいハンドのフラットは初心者リークです。BBアンティでポットが大きく見えても、非BBで受け身に入るより降りる判断が長期的に安定します。';
        out.suggest='推奨: フォールド。ブロッカーやフォールドエクイティが明確な時だけ3bet jam';
        out.strategyMix='Fold 80-95% / Call 0-5% / 3bet jam 5-15%';
      }
      if(bubble)out.note+=' バブル/チケット目前では、カバーされている時の薄いフラットはさらに価値が下がります。';
      return out;
    }

    if(action==='call'&&facing&&pos==='BB'&&stackBB<=20){
      note+='BBアンティ環境のBBはポットオッズが良く、リングより広く守れます。ただし有効'+stackBB+'BBでは実現率より、ドミネート・リバースインプライド・フロップ後のコミットを重く見ます。';
      if(handFrac<=0.32||isSuited||isPair){
        out.quality='good';out.deduction=0;
        out.note=note+' このタイプはBBディフェンスとして自然です。トップヒット時もキッカー負けやバブル圧を意識し、ワンペアで払いすぎないことが大切です。';
        out.suggest='推奨: コール可。強いペア/強Axは一部reshove';
        out.strategyMix='Fold 25-55% / Call 35-65% / 3bet jam 5-20%';
      }else if(handFrac<=0.52){
        out.quality='ok';out.deduction=4;
        out.note=note+' 防衛下限に近いコールです。ポットオッズだけで自動コールせず、相手のオープン位置とポストフロップで降りられるかを条件にします。';
        out.suggest='推奨: ルース後ろ位置にはコール可、EPやバブル圧が強い時はフォールド';
        out.strategyMix='Fold 45-70% / Call 25-45% / 3bet jam 0-10%';
      }else{
        out.quality='bad';out.deduction=8;
        out.note=note+' 弱いオフスーツのBB防衛は、安く見えてもショートトーナメントでは失点源になりやすいです。特にペアを作った時に降りられない初心者には危険です。';
        out.suggest='推奨: フォールド';
        out.strategyMix='Fold 75-95% / Call 5-20% / 3bet jam 0-5%';
      }
      return out;
    }

    if(raiseLike&&facing&&stackBB<=20){
      if(jamLike){
        if(reshoveCandidate){
          out.quality='good';out.deduction=0;
          out.note=note+'有効'+stackBB+'BBでの3bet jam/reshoveは自然です。BBアンティで初期ポットが大きく、コールで実現率勝負にするより、先にフォールドエクイティを使う価値があります。';
          out.suggest='推奨: 3bet jamとして妥当。相手が極端にタイトなら下限だけ調整';
          out.strategyMix=premium?'Fold 0% / Call 0-10% / 3bet jam 90-100%':'Fold 35-60% / Call 0-10% / 3bet jam 35-60%';
        }else{
          out.quality='bad';out.deduction=12;
          out.note=note+'reshoveとしてはハンドが弱めです。20BB以下でも、何でも押すのではなくブロッカー・スーテッド性・ペア価値・相手のオープン位置を見ます。';
          out.suggest='推奨: フォールド寄り。ルースオープン相手にだけ低頻度reshove';
          out.strategyMix='Fold 75-90% / Call 0-5% / 3bet jam 10-25%';
        }
      }else{
        out.quality=premium?'ok':'bad';
        out.deduction=premium?3:8;
        out.note=note+'有効'+stackBB+'BBで小さく3betすると、ほぼコミットしながら相手に選択権を渡します。プレミアム以外は3bet jam / fold の方が学習しやすく、実戦でも迷いが減ります。';
        out.suggest=premium?'推奨: jam主体。AA/KKなどは一部小さめ誘いも可':'推奨: 3bet jamまたはフォールド';
        out.strategyMix=premium?'Fold 0% / Call 0-10% / 3bet jam 70-90% / 小3bet 10-20%':'Fold 55-80% / Call 0-5% / 3bet jam 20-45%';
      }
      if(bubble)out.note+=' バブルではカバー関係により下限reshoveを締め、フォールドエクイティが高い相手を選びます。';
      return out;
    }

    if(raiseLike&&!facing&&pos!=='BB'&&stackBB<=25){
      const openBB=(d.amount||0)/bb;
      if(jamLike&&stackBB<=14){
        const ep=['UTG','UTG+1','MP','LJ'].includes(pos);
        const jamOK=ep?(hRank<=22):(hRank<=45||hcat==='suited_ace'||hcat==='mid_pair'||hcat==='small_pair'||hcat==='suited_connector');
        if(jamOK){
          out.quality='good';out.deduction=0;
          out.note=note+'有効'+stackBB+'BBのopen jamは自然な選択肢です。BBアンティで初期ポットが大きく、通常オープン後に3bet jamを受ける難しさを避けられます。';
          out.suggest='推奨: open jamとして妥当。強すぎるハンドは一部小さめオープンも混ぜる';
          out.strategyMix=ep?'Fold 40-70% / Open 20-40% / Open jam 10-25%':'Fold 20-55% / Open 20-45% / Open jam 25-55%';
        }else{
          out.quality='bad';out.deduction=12;
          out.note=note+'open jamとしてはハンドが弱めです。14BB以下でも、ポジション・ブロッカー・スーテッド性・後続人数を見ずに押すと、チケット戦では不要な分散になります。';
          out.suggest='推奨: フォールド。後ろ寄りでフォールドエクイティが高い時だけ低頻度jam';
          out.strategyMix='Fold 75-95% / Open 0-10% / Open jam 5-20%';
        }
        if(bubble)out.note+=' バブルではカバーされている相手へのプレッシャーは強力ですが、自分がカバーされている時の下限jamは締めます。';
        if((d.coverState==='covered'||d.coverState==='mixed_covered')&&!jamOK){
          out.deduction=(out.deduction||0)+4;
          out.note+=' さらにカバーされているため、下限open jamの失敗が即終了につながりやすい点を重く見ます。';
        }
        return out;
      }
      if(action!=='allin'&&openBB>2.4){
        out.quality='ok';out.deduction=5;
        out.note=note+'BBアンティの有効'+stackBB+'BBでは、標準オープンは2.0〜2.3BB寄りで十分です。'+openBB.toFixed(1)+'BBオープンは少し大きく、3bet jamを受けた時の損失が増えます。';
        out.suggest='推奨: 2.0〜2.3BBオープン。14BB以下の一部ハンドはopen jamも検討';
        out.strategyMix=late?'Foldは締めすぎない / Open 2.0-2.3BB中心 / 一部open jam':'Open 2.0-2.3BB中心。EPはレンジを締める';
        return out;
      }
      if(stackBB<=14&&late&&hRank<=45&&action!=='allin'){
        out.quality='good';out.deduction=0;
        out.note=note+'有効'+stackBB+'BBの後ろ寄りポジションでは、通常オープンに加えてopen jamも混ざる深さです。今回のオープン自体は自然ですが、相手の3bet圧が強い卓では押し切る選択も学習対象になります。';
        out.suggest='推奨: 2.0BBオープンまたは一部open jam';
        out.strategyMix='Fold 0-25% / Open 45-75% / Open jam 15-35%';
        return out;
      }
    }

    if(action==='fold'&&facing&&stackBB<=20&&hRank>30){
      out.quality='good';out.deduction=0;
      out.note=note+'有効'+stackBB+'BBでは、レイズに対する中途半端なコールを減らすのが重要です。押し返せないハンドをきちんと降りるのは、トーナメント序中盤を生き残る土台になります。';
      out.suggest='推奨: フォールド。押せるブロッカー/ペア/スーテッド系だけreshove候補';
      out.strategyMix='Fold 70-95% / Call 0-10% / 3bet jam 5-25%';
      return out;
    }
    return null;
  }

  function assignDecisionAxis(ev){
    const tags=[];
    function addTag(t){if(t&&!tags.includes(t))tags.push(t);}
    let primary='';
    if(ev.street==='preflop'){
      primary=ev.tournamentAxis||(ev.liveCashReraisedPotProfile&&ev.liveCashReraisedPotProfile.axis)||(ev.liveCashSpotProfile&&ev.liveCashSpotProfile.axis)||ev.lineContext||'プリフロップ参加レンジ';
      addTag('レンジ');
      if(ev.lineContext)addTag(ev.lineContext);
      if(ev.action==='raise'||ev.action==='allin')addTag('サイズ/フォールドエクイティ');
      if(ev.toCall>0)addTag('ポットオッズ');
      if(ev.strategyMix)addTag('ミックス頻度');
      if(ev.stackBB!=null)addTag('有効BB');
      if(ev.icmPressure&&ev.icmPressure!=='低')addTag('ICM');
    }else{
      const facing=ev.toCall>0;
      const betting=ev.action==='raise'||ev.action==='bet'||ev.action==='allin';
      if(ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.axis&&ev.liveCashRiverDecisionProfile.severity==='bad')primary=ev.liveCashRiverDecisionProfile.axis;
      else if(ev.liveCashMultiwayProfile&&ev.liveCashMultiwayProfile.axis&&ev.liveCashMultiwayProfile.severity==='bad')primary=ev.liveCashMultiwayProfile.axis;
      else if(ev.liveCashReraisedPotProfile&&ev.liveCashReraisedPotProfile.axis&&ev.liveCashReraisedPotProfile.severity==='bad')primary=ev.liveCashReraisedPotProfile.axis;
      else if(ev.liveCashInitiativeProfile&&ev.liveCashInitiativeProfile.axis&&ev.liveCashInitiativeProfile.severity==='bad')primary=ev.liveCashInitiativeProfile.axis;
      else if(ev.postflopDefensePlanProfile&&ev.postflopDefensePlanProfile.axis&&ev.postflopDefensePlanProfile.severity==='bad')primary=ev.postflopDefensePlanProfile.axis;
      else if(ev.postflopCallFuturePlanProfile&&ev.postflopCallFuturePlanProfile.axis&&ev.postflopCallFuturePlanProfile.severity==='bad')primary=ev.postflopCallFuturePlanProfile.axis;
      else if(ev.postflopBarrelPlanProfile&&ev.postflopBarrelPlanProfile.axis&&ev.postflopBarrelPlanProfile.severity==='bad')primary=ev.postflopBarrelPlanProfile.axis;
      else if(ev.postflopRaisePlanProfile&&ev.postflopRaisePlanProfile.axis&&ev.postflopRaisePlanProfile.severity==='bad')primary=ev.postflopRaisePlanProfile.axis;
      else if(ev.postflopBetPurposeProfile&&ev.postflopBetPurposeProfile.axis&&ev.postflopBetPurposeProfile.severity==='bad')primary=ev.postflopBetPurposeProfile.axis;
      else if(ev.liveCashSprProfile&&ev.liveCashSprProfile.axis&&!(ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane==='riverOnePairCall'))primary=ev.liveCashSprProfile.axis;
      else if(ev.liveCashSpotProfile&&ev.liveCashSpotProfile.axis)primary=ev.liveCashSpotProfile.axis;
      else if(ev.street==='river'&&facing)primary='リバーのコール/フォールド';
      else if(facing)primary='ポットオッズと実効EQ';
      else if(betting)primary=ev.street==='river'?'リバーのバリュー/ブラフサイズ':'ベット頻度とサイズ';
      else if(ev.action==='check')primary='チェック頻度と主導権';
      else primary='ポストフロップ判断';
      if(ev.effectiveEqPct!=null)addTag('実効EQ');
      if(ev.realizationPct!=null)addTag('実現率');
      if(ev.rangeAdv)addTag('レンジ優位');
      if(ev.nutAdv)addTag('ナッツ優位');
      if(betting)addTag('サイズ');
      if(ev.postflopRaisePlanProfile)addTag('レイズ判断');
      if(ev.street==='river')addTag('リバー圧力');
      if(ev.tournamentAxis)addTag(ev.tournamentAxis);
      if(ev.icmPressure&&ev.icmPressure!=='低')addTag('ICM');
    }
    if(ev.liveCashSpotProfile){
      addTag('リング');
      addTag(ev.liveCashSpotProfile.label);
    }
    if(ev.liveCashSprProfile){
      addTag('SPR');
      addTag(ev.liveCashSprProfile.label);
    }
    if(ev.liveCashInitiativeProfile){
      addTag('主導権');
      addTag(ev.liveCashInitiativeProfile.label);
    }
    if(ev.liveCashReraisedPotProfile){
      addTag('3BET/4BET');
      addTag(ev.liveCashReraisedPotProfile.label);
    }
    if(ev.liveCashMultiwayProfile){
      addTag('マルチウェイ');
      addTag(ev.liveCashMultiwayProfile.label);
    }
    if(ev.liveCashRiverDecisionProfile){
      addTag('リバー金額');
      addTag(ev.liveCashRiverDecisionProfile.label);
    }
    if(ev.postflopBetPurposeProfile){
      addTag('ベット目的');
      addTag(ev.postflopBetPurposeProfile.purpose);
    }
    if(ev.postflopBarrelPlanProfile){
      addTag('継続ベット');
      addTag(ev.postflopBarrelPlanProfile.verdict);
    }
    if(ev.postflopDefensePlanProfile){
      addTag('受け方');
      addTag(ev.postflopDefensePlanProfile.verdict);
    }
    if(ev.postflopCallFuturePlanProfile){
      addTag('次ストリート');
      addTag(ev.postflopCallFuturePlanProfile.verdict);
    }
    if(ev.deduction>0)addTag('EV損失');
    ev.evalAxis=primary;
    ev.axisTags=tags.slice(0,6);
  }
  function scoredDeduction(ev){
    return (ev.quality==='bad'||(ev.quality==='ok'&&(ev.deduction||0)>0))?(ev.deduction||0):0;
  }
  // FISH_TANK_EVALUATION_WEIGHTS_MODULE
  for(const d of hr.decisions.filter(d=>d.isHuman)){
    const ev={...d,quality:'ok',comment:'',suggest:'',deduction:0};
    ev.hiddenInfoPolicy='相手実ハンド不使用';
    ev.equitySource=d.street==='preflop'?'レンジ表/公開アクション':'Hero手札+公開ボードのレンジ推定EQ';
    // FISH_TANK_PREFLOP_EVALUATION_MODULE
    }else{
      // ポストフロップ - 新レンジベース評価
      const hasOdds=d.potOdds>0;
      const streetOpps=oppsAtStreet(d.street); // ストリート別相手数
      ev.streetOpps=streetOpps;
      let result=null;
      if(d.action==='check'){
        result=evalCheck(d,hr,human,streetOpps);
      }else if(d.action==='call'&&hasOdds){
        result=evalCall(d,hr,human,streetOpps);
      }else if(d.action==='fold'&&hasOdds){
        result=evalFold(d,hr,human,streetOpps);
      }else if(d.action==='raise'||d.action==='allin'||d.action==='bet'){
        result=evalBet(d,hr,human,streetOpps);
      }else if(d.action==='fold'&&!hasOdds){
        ev.quality='bad';ev.deduction=5;score-=5;ev.comment='チェックの後にフォールドはできません（操作ミス）。';
      }else{
        ev.quality='ok';ev.comment=({fold:'フォールド。',check:'チェック。',raise:'ベット。',bet:'ベット。',allin:'オールイン。',call:'コール。'}[d.action]||'');
      }
      if(result){
        ev.quality=result.quality;
        ev.comment=result.comment;
        ev.deduction=result.deduction||0;
        if(result.suggest)ev.suggest=result.suggest;
        if(result.isMix!=null)ev.isMix=result.isMix;
        if(result.evLoss)ev.evLoss=result.evLoss;
        if(result.freqPct!=null)ev.freqPct=result.freqPct;
        if(result.rawEqPct!=null)ev.rawEqPct=result.rawEqPct;
        if(result.effectiveEqPct!=null)ev.effectiveEqPct=result.effectiveEqPct;
        if(result.realizationPct!=null)ev.realizationPct=result.realizationPct;
        if(result.rangeAdv)ev.rangeAdv=result.rangeAdv;
        if(result.nutAdv)ev.nutAdv=result.nutAdv;
        if(result.boardTextureMixProfile)ev.boardTextureMixProfile=result.boardTextureMixProfile;
        if(result.boardTextureSizeProfile)ev.boardTextureSizeProfile=result.boardTextureSizeProfile;
        if(result.quality==='bad')score-=(result.deduction||8);
        else if(result.quality==='ok'&&result.deduction)score-=result.deduction;
      }
      const opCommLen={flop:3,turn:4,river:5}[d.street]||0;
      const opComm=hr.community.slice(0,opCommLen);
      const prevCommLen={flop:0,turn:3,river:4}[d.street]||0;
      const prevComm=prevCommLen?hr.community.slice(0,prevCommLen):[];
      ev.boardTextureProfile=opComm.length>=3?boardTextureProfile(opComm,d.street,prevComm):null;
      const opEval=human.holeCards&&human.holeCards.length>=2&&opComm.length>=3?HandEval.evaluate([...human.holeCards,...opComm]):null;
      const opRole=opEval?handRole(human.holeCards,opComm,opEval):null;
      const pfRaisesForTexture=hr.decisions.filter(function(x){return x.street==='preflop'&&(x.action==='raise'||x.action==='allin');});
      const lastPfrForTexture=pfRaisesForTexture[pfRaisesForTexture.length-1]||null;
      const humanWasTexturePfr=humanWasLastPreflopAggressor(hr);
      ev.boardTextureTransitionProfile=ev.boardTextureProfile?boardTextureTransitionProfile(d,ev.boardTextureProfile,opRole,{isPfr:humanWasTexturePfr,nOpponents:streetOpps}):null;
      ev.rangeNutAdvantageProfile=ev.boardTextureProfile?rangeNutAdvantageProfile(hr,d,ev.boardTextureProfile,opRole,{isPfr:humanWasTexturePfr,nOpponents:streetOpps}):null;
      if(ev.rangeNutAdvantageProfile){
        ev.rangeAdv=ev.rangeNutAdvantageProfile.heroRangeAdv||ev.rangeAdv;
        ev.nutAdv=ev.rangeNutAdvantageProfile.heroNutAdv||ev.nutAdv;
      }
      const defensePosState=postflopPositionState(hr,d);
      const opponentTypeProfile=liveCashDecisionOpponentTypeProfile(hr,d,streetDecisionIndex(hr,d)>=0?hr.decisions.slice(0,streetDecisionIndex(hr,d)):hr.decisions);
      ev.rangeActionUpdateProfile=ev.boardTextureProfile?rangeActionUpdateProfile(hr,d,ev.boardTextureProfile,opRole,{heroRangeAdv:ev.rangeAdv,nOpponents:streetOpps}):null;
      ev.postflopBetPurposeProfile=ev.boardTextureProfile?postflopBetPurposeProfile(hr,d,opRole,ev.boardTextureProfile,ev.rangeNutAdvantageProfile,{isPfr:humanWasTexturePfr,nOpponents:streetOpps,opponentTypeProfile:opponentTypeProfile}):null;
      ev.postflopRaisePlanProfile=ev.boardTextureProfile?postflopRaisePlanProfile(hr,d,opRole,ev.boardTextureProfile,ev.rangeNutAdvantageProfile,{isPfr:humanWasTexturePfr,nOpponents:streetOpps}):null;
      ev.postflopBarrelPlanProfile=ev.boardTextureProfile?postflopBarrelPlanProfile(hr,d,opRole,ev.boardTextureProfile,ev.postflopBetPurposeProfile,ev.rangeActionUpdateProfile,{isPfr:humanWasTexturePfr,nOpponents:streetOpps}):null;
      ev.postflopDefensePlanProfile=ev.boardTextureProfile?postflopDefensePlanProfile(hr,d,opRole,ev.boardTextureProfile,ev.rangeActionUpdateProfile,{isOOP:defensePosState.isOOP,nOpponents:streetOpps}):null;
      ev.postflopCallFuturePlanProfile=ev.boardTextureProfile?postflopCallFuturePlanProfile(hr,d,opRole,ev.boardTextureProfile,ev.postflopDefensePlanProfile,{isOOP:defensePosState.isOOP,nOpponents:streetOpps}):null;
      // [Codex fix 2026-06-12] トリップス/クアッズ等の強い完成役をワンペア監査へ流さない。
      // Aトリップスを「弱いワンペア」と説明するような誤分類をここで遮断する。
      const onePairLikeForPressure=opEval&&(opEval.cat===1||(opRole&&opRole.valueTier==='board_completed_top_pair'));
      ev.onePairProfile=onePairLikeForPressure?onePairPressureProfile(hr,d,opRole,opComm.length>=3?boardTex(opComm):null,streetOpps):null;
    }
    if(!(hr.tournamentContext&&hr.tournamentContext.enabled)){
      const lcCommLen={flop:3,turn:4,river:5}[d.street]||0;
      const lcComm=lcCommLen?hr.community.slice(0,lcCommLen):[];
      const lcEval=human.holeCards&&human.holeCards.length>=2&&lcComm.length>=3?HandEval.evaluate([...human.holeCards,...lcComm]):null;
      const lcRole=lcEval?handRole(human.holeCards,lcComm,lcEval):null;
      const lcTex=lcComm.length>=3?boardTex(lcComm):null;
      ev.liveCashSpotProfile=liveCashSpotProfile(hr,d,human.holeCards,lcRole,lcTex,ev.streetOpps||oppsAtStreet(d.street),ev.lineContext);
      ev.liveCashSprProfile=liveCashSprProfile(hr,d,lcRole,lcTex,ev.streetOpps||oppsAtStreet(d.street));
      ev.liveCashInitiativeProfile=liveCashInitiativeProfile(hr,d,lcRole,lcTex,ev.streetOpps||oppsAtStreet(d.street));
      ev.liveCashReraisedPotProfile=liveCashReraisedPotProfile(hr,d,human.holeCards,lcRole,lcTex,ev.streetOpps||oppsAtStreet(d.street),ev.lineContext);
      ev.liveCashMultiwayProfile=liveCashMultiwayProfile(hr,d,lcRole,lcTex,ev.streetOpps||oppsAtStreet(d.street));
      ev.liveCashRiverDecisionProfile=liveCashRiverDecisionProfile(hr,d,lcRole,lcTex,ev.streetOpps||oppsAtStreet(d.street));
    }
    if(d.street==='preflop'&&hr.tournamentContext&&hr.tournamentContext.enabled){
      // [Codex fix 2026-05-26] BBアンティ/有効BB/局面をプリフロップ評価に常時付与。
      const tc1=human.holeCards[0],tc2=human.holeCards[1];
      const tht=handType(tc1,tc2);
      const thRank=HAND_STRENGTH[tht]||169;
      const thFrac=HAND_COMBO_FRAC[tht]||0.99;
      const tpos=d.position||'MP';
      const tn=tournamentPreflopNote(hr.tournamentContext,d,tpos,thRank,thFrac);
      const preCtxEarly=(function(){
        const before=prefBefore(d);
        const firstAgg=before.find(function(x){return x.street==='preflop'&&(x.action==='raise'||x.action==='allin');});
        const order=['UTG','UTG+1','MP','LJ','HJ','CO','BTN','SB','BB'];
        const oi=order.indexOf(tpos);
        const playersBehind=oi>=0?Math.max(0,order.length-oi-1):null;
        const openerStackBB=firstAgg&&firstAgg.playerChipsBefore?Math.max(1,Math.round(firstAgg.playerChipsBefore/(hr.bigBlind||1))):null;
        return{openerPos:firstAgg?firstAgg.position:'',openerStackBB,limpers:limpCount,playersBehind};
      })();
      ev.comment=(ev.comment||'')+tn.note;
      ev.stackBB=tn.stackBB;
      ev.bbAnte=hr.tournamentContext.bbAnte;
      ev.tournamentPhase=hr.tournamentContext.phase;
      ev.stackBand=tn.stackBand;
      ev.icmPressure=tn.icmPressure;
      ev.tournamentAxis=tn.tournamentAxis;
      ev.tournamentPhaseAxis=tn.tournamentPhaseAxis;
      ev.tournamentFocus=hr.tournamentContext.focusLabel;
      ev.coverState=d.coverState;
      ev.coverLabel=d.coverLabel;
      ev.coverPressure=d.coverPressure;
      ev.coverDeltaBB=d.coverDeltaBB;
      ev.coverCount=d.coverCount;
      ev.coveredByCount=d.coveredByCount;
      ev.stackRank=d.stackRank;
      ev.shortestStackBB=d.shortestStackBB;
      ev.shortestOppStackBB=d.shortestOppStackBB;
      ev.bbInHands=d.bbInHands;
      ev.nextBBPressure=d.nextBBPressure;
      ev.shorterStackCount=d.shorterStackCount;
      ev.tournamentLesson=tournamentResultLesson(hr.tournamentContext,d,tn.stackBB,tpos);
      ev.tournamentRangeHint=tournamentRangeHint(hr.tournamentContext,d,human.holeCards,tn.stackBB,tpos);
      ev.tournamentRangeProfile=tournamentRangeProfile(hr.tournamentContext,d,human.holeCards,tn.stackBB,tpos);
      ev.bubbleProfile=tournamentBubbleProfile(hr.tournamentContext,d,tn.stackBB,tpos);
      ev.bubbleIcmRange=tournamentBubbleIcmRangeProfile(hr.tournamentContext,d,human.holeCards,tn.stackBB,tpos,ev.bubbleProfile);
      ev.earlyProfile=tournamentEarlyProfile(hr.tournamentContext,d,human.holeCards,tn.stackBB,tpos,(hr.tournamentContext&&hr.tournamentContext.players)||hr.players.length||6,preCtxEarly);
      ev.middleProfile=tournamentMiddleProfile(hr.tournamentContext,d,tn.stackBB,tpos,human.holeCards);
      ev.finalTableProfile=tournamentFinalTableProfile(hr.tournamentContext,d,tn.stackBB,tpos,human.holeCards);
      ev.finalTableRangeProfile=ev.finalTableProfile&&ev.finalTableProfile.rangeProfile?ev.finalTableProfile.rangeProfile:null;
      if(ev.finalTableRangeProfile&&ev.finalTableRangeProfile.mix)ev.strategyMix=ev.finalTableRangeProfile.mix;
      ev.headsUpProfile=tournamentHeadsUpProfile(hr.tournamentContext,d,tn.stackBB,tpos,human.holeCards);
      const tsAdj=tournamentShortStackPreflopAdjust(hr.tournamentContext,d,tpos,thRank,thFrac,handCat(tc1,tc2),tc1.suit===tc2.suit,tc1.rank===tc2.rank);
      if(tsAdj&&!facingFourBetCtx(d)){
        const prevDed=ev.deduction||0;
        let nextDed=tsAdj.deduction!=null?tsAdj.deduction:prevDed;
        let nextQuality=tsAdj.quality||ev.quality;
        const explicitJamFix=(d.action==='allin'||(d.amount||0)>=Math.max((d.playerChipsBefore||0)*0.65,(hr.bigBlind||1)*10))&&/jam|reshove/.test(tsAdj.suggest||'');
        const bbDefenseFix=tpos==='BB'&&d.action==='call'&&prevDed<=8;
        // [Codex fix 2026-05-27] Tモード評価で重い基礎ミスを雑に免罪しない。明示的なjam評価などだけ大きな上書きを許す。
        if(prevDed>=12&&nextDed<prevDed&&!explicitJamFix&&!bbDefenseFix){
          nextDed=Math.max(nextDed,8);
          if(nextQuality==='good')nextQuality='ok';
          tsAdj.note+=' ただし基礎レンジ上は薄い判断なので、この局面でも完全な正解ではなくボーダー扱いにします。';
        }
        if(nextDed!==prevDed){
          score-=(nextDed-prevDed);
          ev.deduction=nextDed;
        }
        if(nextQuality)ev.quality=nextQuality;
        const replaceBaseComment=nextDed<prevDed&&(explicitJamFix||bbDefenseFix||nextQuality==='good');
        if(tsAdj.note){
          if(replaceBaseComment){
            ev.comment=tn.note+tsAdj.note;
          }else{
            ev.comment=(ev.comment||'')+tsAdj.note;
          }
        }
        if(tsAdj.suggest)ev.suggest=tsAdj.suggest;
        if(tsAdj.strategyMix)ev.strategyMix=tsAdj.strategyMix;
      }
    }else if(hr.tournamentContext&&hr.tournamentContext.enabled){
      // [Codex fix 2026-05-27] ポストフロップにもTモードの学習ポイントを出す。
      const tStackBB=Math.max(1,Math.round((d.playerChipsBefore||((hr.tournamentContext.stackBB||25)*(hr.bigBlind||1)))/(hr.bigBlind||1)));
      const axes=tournamentEvalAxes(hr.tournamentContext,tStackBB);
      ev.stackBB=tStackBB;
      ev.bbAnte=hr.tournamentContext.bbAnte;
      ev.tournamentPhase=hr.tournamentContext.phase;
      ev.stackBand=axes.stackBand;
      ev.icmPressure=axes.icmPressure;
      ev.tournamentAxis=axes.primary;
      ev.tournamentPhaseAxis=axes.phaseAxis;
      ev.tournamentFocus=hr.tournamentContext.focusLabel;
      ev.coverState=d.coverState;
      ev.coverLabel=d.coverLabel;
      ev.coverPressure=d.coverPressure;
      ev.coverDeltaBB=d.coverDeltaBB;
      ev.coverCount=d.coverCount;
      ev.coveredByCount=d.coveredByCount;
      ev.stackRank=d.stackRank;
      ev.shortestStackBB=d.shortestStackBB;
      ev.shortestOppStackBB=d.shortestOppStackBB;
      ev.bbInHands=d.bbInHands;
      ev.nextBBPressure=d.nextBBPressure;
      ev.shorterStackCount=d.shorterStackCount;
      ev.tournamentLesson=tournamentResultLesson(hr.tournamentContext,d,tStackBB,d.position||'MP');
      ev.tournamentRangeProfile=tournamentRangeProfile(hr.tournamentContext,d,human.holeCards,tStackBB,d.position||'MP');
      ev.bubbleProfile=tournamentBubbleProfile(hr.tournamentContext,d,tStackBB,d.position||'MP');
      ev.earlyProfile=tournamentEarlyProfile(hr.tournamentContext,d,human.holeCards,tStackBB,d.position||'MP',(hr.tournamentContext&&hr.tournamentContext.players)||hr.players.length||6,{limpers:limpCount});
      ev.middleProfile=tournamentMiddleProfile(hr.tournamentContext,d,tStackBB,d.position||'MP',human.holeCards);
      ev.finalTableProfile=tournamentFinalTableProfile(hr.tournamentContext,d,tStackBB,d.position||'MP',human.holeCards);
      ev.finalTableRangeProfile=ev.finalTableProfile&&ev.finalTableProfile.rangeProfile?ev.finalTableProfile.rangeProfile:null;
      ev.headsUpProfile=tournamentHeadsUpProfile(hr.tournamentContext,d,tStackBB,d.position||'MP',human.holeCards);
      const mwCommLen={flop:3,turn:4,river:5}[d.street]||0;
      const mwComm=hr.community.slice(0,mwCommLen);
      const mwEval=human.holeCards&&human.holeCards.length>=2&&mwComm.length>=3?HandEval.evaluate([...human.holeCards,...mwComm]):null;
      const mwRole=mwEval?handRole(human.holeCards,mwComm,mwEval):null;
      ev.headsUpRiverProfile=tournamentHeadsUpRiverProfile(hr.tournamentContext,hr,d,mwRole,mwComm.length>=3?boardTex(mwComm):null,tStackBB,d.position||'MP');
      ev.earlyMultiwayProfile=tournamentEarlyMultiwayProfile(hr.tournamentContext,d,mwRole,ev.streetOpps||oppsAtStreet(d.street),d.position||'MP');
      ev.earlyDeepSprProfile=tournamentEarlyDeepSprProfile(hr.tournamentContext,d,mwRole,mwComm.length>=3?boardTex(mwComm):null,d.position||'MP');
      ev.finalTablePostflopProfile=tournamentFinalTablePostflopProfile(hr.tournamentContext,d,mwRole,mwComm.length>=3?boardTex(mwComm):null,tStackBB,d.position||'MP',ev.finalTableProfile,ev.streetOpps||oppsAtStreet(d.street));
    }
    const scoredBefore=scoredDeduction(ev);
    assignDecisionAxis(ev);
    applyDecisionAxisWeight(ev);
    applyLiveCashSpotWeight(ev);
    applyLiveCashReraisedPotWeight(ev);
    applyLiveCashMultiwayWeight(ev);
    applyLiveCashInitiativeWeight(ev);
    applyLiveCashSprWeight(ev);
    applyFinalTableRangeWeight(ev);
    applyTournamentPhaseWeight(ev);
    applyOnePairProfileWeight(ev);
    applyLiveCashRiverDecisionWeight(ev);
    applyHeadsUpRiverWeight(ev);
    applyFinalTablePostflopWeight(ev);
    applyRangeNutAdvantageWeight(ev);
    applyRangeActionUpdateWeight(ev);
    applyPostflopBetPurposeWeight(ev);
    applyPostflopRaisePlanWeight(ev);
    applyPostflopBarrelPlanWeight(ev);
    applyPostflopDefensePlanWeight(ev);
    applyPostflopCallFuturePlanWeight(ev);
    applyBoardTextureTransitionWeight(ev);
    composeNaturalReview(ev,d,hr);
    harmonizeFinalEvaluationText(ev);
    attachGtoTheorySnapshot(ev);
    ev.finalTableLearningPoint=tournamentFinalTableLearningPoint(ev);
    const scoredAfter=scoredDeduction(ev);
    if(scoredAfter!==scoredBefore)score-=(scoredAfter-scoredBefore);
    evals.push(ev);
  }
  score=Math.max(0,Math.min(100,score));
  // ---- プリフロップ / ポストフロップ 別スコア ----
  // evals の street フィールドを使って後計算（ループ改変不要）
  // pfScore/poScoreはbad/okミスのみ減点(goodクオリティのボーダーライン減点は含まない)
  const _ded=(e)=>(e.quality==='bad'||(e.quality==='ok'&&e.deduction))?(e.deduction||0):0;
  const pfDed=evals.filter(e=>e.street==='preflop').reduce((a,e)=>a+_ded(e),0);
  const poDed=evals.filter(e=>e.street!=='preflop').reduce((a,e)=>a+_ded(e),0);
  const pfScore=Math.max(0,Math.min(100,100-pfDed));
  const sawFlop=evals.some(e=>e.street!=='preflop');
  const poScore=sawFlop?Math.max(0,Math.min(100,100-poDed)):null;
  // [Codex fix 2026-05-28] Tモードでは総合点とは別に、テーマ別の能力スコアを出す。
  function tournamentSubScores(){
    if(!hr.tournamentContext||!hr.tournamentContext.enabled)return null;
    const cats={
      push:{label:'押し引き',ded:0,seen:false,note:'open jam / reshove / fold-call整理'},
      icm:{label:'ICM/バブル',ded:0,seen:false,note:'通過率・カバー関係・薄い衝突回避'},
      ante:{label:'BBアンティ/サイズ',ded:0,seen:false,note:'小さめオープン・スチール・BB防衛'},
      post:{label:'事故回避',ded:0,seen:false,note:'浅いSPRでの払いすぎ防止'}
    };
    for(const e of evals){
      const ded=_ded(e);
      const txt=((e.comment||'')+' '+(e.suggest||'')+' '+(e.tournamentLesson||'')).toLowerCase();
      if(e.street==='preflop'){
        const short=(e.stackBB!=null&&e.stackBB<=25);
        const pushSpot=short||/jam|reshove|push\/fold|フォールド|コール|flat/.test(txt);
        if(pushSpot){cats.push.seen=true;cats.push.ded+=ded;}
        if(e.icmPressure==='高'||/icm|バブル|チケット|通過率|カバー/.test(txt)){
          cats.icm.seen=true;cats.icm.ded+=ded;
          if((e.coverState==='covered'||e.coverState==='mixed_covered')&&ded>0)cats.icm.ded+=Math.ceil(ded*0.35);
        }
        if(/bbアンティ|スチール|オープンサイズ|2\.|bb防衛|defend|ディフェンス/.test(txt)){
          cats.ante.seen=true;cats.ante.ded+=Math.max(0,ded);
        }
      }else{
        cats.post.seen=true;cats.post.ded+=ded;
        if(e.icmPressure==='高'){cats.icm.seen=true;cats.icm.ded+=Math.round(ded*0.6);}
      }
    }
    const focus=hr.tournamentContext.focusId||'general';
    if(focus==='reshove20')cats.push.note='20BB前後のreshove/fold判断';
    else if(focus==='openjam14')cats.push.note='14BB前後のopen jam判断';
    else if(focus==='bubble_call')cats.icm.note='バブルで薄いコールを避ける力';
    else if(focus==='bb_defend')cats.ante.note='BBアンティ下のBB防衛レンジ';
    else if(focus==='bbante_steal')cats.ante.note='BBアンティのスチールと小さめオープン';
    return Object.keys(cats).map(function(k){
      const c=cats[k];
      const active=c.seen||(k==='icm'&&(hr.tournamentContext.phase==='バブル'||hr.tournamentContext.focusId==='bubble_call'))||(k==='post'&&sawFlop);
      if(!active)return null;
      const score=Math.max(0,Math.min(100,100-Math.round(c.ded*1.4)));
      return{key:k,label:c.label,score,grade:score>=93?'S':score>=82?'A':score>=70?'B':score>=55?'C':score>=40?'D':'F',note:c.note};
    }).filter(Boolean);
  }
  const tournamentScores=tournamentSubScores();
  // [Codex fix 2026-06-05] Ring cash also needs skill buckets, otherwise tournament review feels more structured than cash review.
  function liveCashSubScores(){
    if(hr.tournamentContext&&hr.tournamentContext.enabled)return null;
    const cats={
      range:{label:'参加レンジ',ded:0,seen:false,note:'リンプ/コールドコール/BB防衛'},
      initiative:{label:'主導権',ded:0,seen:false,note:'OOPチェック・ドンク抑制・CB頻度'},
      threebet:{label:'3BETポット',ded:0,seen:false,note:'3BET/4BET後の実現率・OOP継続'},
      multiway:{label:'マルチウェイ',ded:0,seen:false,note:'複数人相手のブラフ頻度・薄バリュー抑制'},
      stack:{label:'有効スタック/SPR',ded:0,seen:false,note:'深いSPRのワンペア管理・浅いSPRのコミット'},
      river:{label:'リバー判断',ded:0,seen:false,note:'ワンペア受け・ブラフキャッチ・バリュー過多補正'},
      value:{label:'バリュー/サイズ',ded:0,seen:false,note:'薄バリュー・サイズ選択・取り切り'}
    };
    for(const e of evals){
      const ded=_ded(e);
      const p=e.liveCashSpotProfile||null;
      const sp=e.liveCashSprProfile||null;
      const ip=e.liveCashInitiativeProfile||null;
      const rp=e.liveCashReraisedPotProfile||null;
      const mwp=e.liveCashMultiwayProfile||null;
      const rvp=e.liveCashRiverDecisionProfile||null;
      const bpp=e.postflopBetPurposeProfile||null;
      const lane=p?p.lane:'';
      const mwlane=mwp?mwp.lane:'';
      const rplane=rp?rp.lane:'';
      const rvlane=rvp?rvp.lane:'';
      const axis=e.evalAxis||'';
      const txt=((e.comment||'')+' '+(e.suggest||'')+' '+axis).toLowerCase();
      if(e.street==='preflop'){
        cats.range.seen=true;
        cats.range.ded+=ded;
        if(lane==='openLimp'||lane==='limpIsoCall'||lane==='sbColdCall')cats.range.ded+=Math.ceil(ded*0.35);
        if(lane==='bbDefend'&&ded>0)cats.range.ded+=Math.ceil(ded*0.15);
        if(rp||lane==='reraisedPot'||/3bet|4bet|5bet/i.test((e.lineContext||'')+' '+axis+' '+txt)){
          cats.threebet.seen=true;
          cats.threebet.ded+=ded;
          if((rplane==='fourBetResponse'||rplane==='fiveBetDecision'||lane==='reraisedPot')&&ded>0)cats.threebet.ded+=Math.ceil(ded*0.25);
        }
      }else{
        if(rp||lane==='threeBetPotOop'||p&&p.is3BetPot||axis==='3BETポット'||/3betポット|3bet\/oop/i.test(txt)){
          cats.threebet.seen=true;
          cats.threebet.ded+=ded;
          if((rplane==='threeBetCallerOop'||lane==='threeBetPotOop')&&ded>0)cats.threebet.ded+=Math.ceil(ded*0.25);
        }
        if(mwp||lane==='multiwayPressure'||p&&p.multiway||axis==='マルチウェイ'||(e.streetOpps!=null&&e.streetOpps>=2)||/マルチウェイ/.test(txt)){
          cats.multiway.seen=true;
          cats.multiway.ded+=ded;
          if((lane==='multiwayPressure'||mwlane==='multiwayBluffOverfreq'||mwlane==='multiwayOnePairCall'||mwlane==='multiwayThinValue')&&ded>0)cats.multiway.ded+=Math.ceil(ded*0.30);
        }
        if(sp||axis==='有効スタック/SPR'){
          cats.stack.seen=true;
          cats.stack.ded+=ded;
          if(sp&&sp.severity==='bad'&&ded>0)cats.stack.ded+=Math.ceil(ded*0.25);
        }
        if(ip||axis==='チェック頻度と主導権'||lane==='limpIsoOopCheck'||lane==='oopDonk'||/ドンク|主導権|チェック/.test(txt)){
          cats.initiative.seen=true;
          cats.initiative.ded+=ded;
          if(lane==='oopDonk'||ip&&ip.severity==='bad')cats.initiative.ded+=Math.ceil(ded*0.25);
        }
        if(e.street==='river'&&(rvp||axis==='リバーの金額判断'||axis==='リバーのコール/フォールド'||lane==='riverOnePairCall'||e.onePairProfile)){
          cats.river.seen=true;
          cats.river.ded+=ded;
          if(lane==='riverOnePairCall'||(e.onePairProfile&&e.onePairProfile.verdict==='bad'))cats.river.ded+=Math.ceil(ded*0.35);
          if(rvp&&rvp.severity==='bad')cats.river.ded+=Math.ceil(ded*0.35);
        }
        if(bpp||(e.action==='raise'||e.action==='bet'||e.action==='allin')||lane==='riverThinValue'||rvlane==='riverThinValueSize'||rvlane==='riverValueTarget'||rvlane==='riverBluffCandidate'||/サイズ|薄バリュー/.test(txt)){
          cats.value.seen=true;
          cats.value.ded+=ded;
          if(bpp&&bpp.severity==='bad')cats.value.ded+=Math.ceil(ded*0.25);
          if(lane==='riverThinValue')cats.value.ded+=Math.ceil(ded*0.20);
          if(rvlane==='riverThinValueSize'||rvlane==='riverBluffCandidate')cats.value.ded+=Math.ceil(ded*0.20);
        }
      }
    }
    if(!Object.keys(cats).some(function(k){return cats[k].seen;}))return null;
    return Object.keys(cats).map(function(k){
      const c=cats[k];
      if(!c.seen)return null;
      const score=Math.max(0,Math.min(100,100-Math.round(c.ded*1.25)));
      return{key:k,label:c.label,score,grade:score>=93?'S':score>=82?'A':score>=70?'B':score>=55?'C':score>=40?'D':'F',note:c.note};
    }).filter(Boolean);
  }
  const liveCashScores=liveCashSubScores();
  const primaryLesson=primaryLessonForHand(hr,evals);
  const badEvals=evals.filter(e=>e.quality==='bad');
  const badCount=badEvals.length;
  let worstDeduction=0;
  {let tmp=100;for(const ev of evals){const prev=tmp;if(ev.quality==='bad'){tmp-=(ev.deduction||8);worstDeduction=Math.max(worstDeduction,prev-tmp);}}}
  let maxGrade='S';
  if(worstDeduction>=20||badCount>=3)maxGrade='C';
  else if(worstDeduction>=12||badCount>=2)maxGrade='B';
  else if(badCount>=1)maxGrade='A';
  let grade,gl;
  const gradeOrder=['S','A','B','C','D','F'];
  // ミックス戦略スポットでのok減点を考慮し、S基準を引き上げ
  // EV損失ベース採点: mixスポットは減点なし、明確ミスのみ減点
  const hasClearMistake=evals.some(e=>e.quality==='bad');
  const hasMixPenalty=evals.some(e=>e.quality==='ok'&&e.deduction>0);
  // [Claude fix 2026-06-09] glMapが常にgl上書きするため、ここではgradeのみ設定（gl代入は冗長）
  if(score>=97&&!hasClearMistake){grade='S';}
  else if(score>=90){grade='A';}
  else if(score>=75){grade='B';}
  else if(score>=50){grade='C';}
  else if(score>=35){grade='D';}
  else{grade='F';}
  if(gradeOrder.indexOf(grade)<gradeOrder.indexOf(maxGrade))grade=maxGrade;
  // プリフロップでフォールドしたハンド（参加なし）はSグレード不可
  // ※ レイズして相手全員フォールドの場合はS可
  const pfLastAct=evals.filter(e=>e.street==='preflop').slice(-1)[0];
  if(pfLastAct&&pfLastAct.action==='fold'&&grade==='S')grade='A';
  // 100点でフォールドのみの場合、ラベルを適切に
  const onlyFoldedPF=evals.length<=1&&pfLastAct&&pfLastAct.action==='fold'&&score>=95&&pfLastAct.quality==='good'&&!(pfLastAct.deduction>0);
  // BBウォーク（アクションなし）はSグレード不可 ― プレーを評価できない
  if(evals.length===0&&grade==='S')grade='A';
  const glMap={S:'完璧に近いプレイ。GTOに準拠しています',A:'良いプレイ。細かいミスが数点あります',B:'平均的。改善できるポイントが複数あります',C:'ミスが目立つ。アナリシスをよく読んでください',D:'深刻なミスがあります。基礎理論を見直してください',F:'根本的な問題があります。GTOレッスンから始めましょう'};
  gl=glMap[grade]||gl;
  if(onlyFoldedPF)gl='プリフロップフォールド。ポジション・ハンドランクに基づく適切な判断です。';
  const premiseAudit=preflopPremiseAudit(hr);
  const result={grade,gradeLabel:gl,score,evals,human,hr,pfScore,poScore,sawFlop,tournamentScores,liveCashScores,primaryLesson,premiseAudit};
  if(!_actualHandAuditRunning){
    result.actualHandAudit=actualHandLeakAudit(hr,result);
    // [Codex fix 2026-06-12] 実ハンド混入監査がFAILなら、レビュー自体の信頼度をスコアにも反映する。
    if(result.actualHandAudit&&result.actualHandAudit.status==='FAIL'){
      result.score=Math.min(result.score,85);
      if(result.score>=75)result.grade='B';
      else if(result.score>=50)result.grade='C';
      else if(result.score>=35)result.grade='D';
      else result.grade='F';
      result.gradeLabel='実ハンド混入監査に失敗しています。相手の実ハンド由来の情報が混ざった可能性があるため、このレビューは要修正です。';
    }
  }
  return result;
}

// ---- REGRESSION TESTS ----
function regressionCard(code){
  return new Card(code[0],code[1]);
}
function regressionCards(codes){
  return codes.map(regressionCard);
}
function regressionPlayer(name,isHuman,hole,opts){
  opts=opts||{};
  return{
    name:name,
    isHuman:!!isHuman,
    active:opts.active!==false,
    folded:!!opts.folded,
    chips:opts.chips==null?500:opts.chips,
    totalInvested:opts.totalInvested||0,
    holeCards:regressionCards(hole||['As','Kd']),
    profile:opts.profile||null,
    handResult:null
  };
}
function regressionDecision(o){
  return Object.assign({
    street:'preflop',
    action:'check',
    amount:0,
    potOdds:0,
    position:'MP',
    pot:0,
    toCall:0,
    facingRaise:false,
    playerName:o&&o.isHuman?'あなた':'villain',
    isHuman:false,
    playerIdx:1,
    playerChipsBefore:500,
    playerBetBefore:0
  },o||{});
}
function regressionHand(opts){
  opts=opts||{};
  const players=opts.players||[
    regressionPlayer('あなた',true,opts.heroHole||['As','Kd'],{chips:opts.heroChips||500}),
    regressionPlayer('villain',false,opts.villainHole||['Qh','Qs'],{chips:opts.villainChips||500})
  ];
  return{
    handNum:opts.handNum||900,
    winners:opts.winners||[],
    community:regressionCards(opts.board||[]),
    players:players,
    decisions:opts.decisions||[],
    pot:opts.pot||0,
    street:opts.street||'showdown',
    dealerIndex:opts.dealerIndex==null?0:opts.dealerIndex,
    bigBlind:opts.bigBlind||5,
    numActive:opts.numActive||players.filter(p=>p.active!==false).length,
    scenario:null,
    pfStory:opts.pfStory||null,
    tournamentContext:opts.tournamentContext||null
  };
}
function runFishTankRegressionTests(){
  const tests=[];
  const add=function(name,fn){tests.push({name,fn});};
  const humanEval=function(an,pred){
    return an.evals.find(function(e){return e.isHuman&&pred(e);});
  };
  add('ライブ実戦教材: 主要トピックをタブ用HTMLに描画する',function(){
    if(typeof renderLivePractice!=='function')return false;
    const html=renderLivePractice();
    return /テーブル\/シート選択/.test(html)
      &&/ストラドルポット/.test(html)
      &&/ティルトの兆候/.test(html)
      &&/セッション終了判断/.test(html)
      &&/バンクロール/.test(html)
      &&/チップハンドリング/.test(html);
  });
  add('セッションチェック: 開始前と終了時の主要項目を描画する',function(){
    if(typeof renderSessionStartChecklist!=='function'||typeof renderSessionEndChecklist!=='function')return false;
    const s=renderSessionStartChecklist();
    const e=renderSessionEndChecklist();
    return /終了時間/.test(s)
      &&/最大損失/.test(s)
      &&/今日の主テーマ/.test(s)
      &&/負けを取り返す/.test(s)
      &&/一番大きなミス/.test(e)
      &&/ティルト/.test(e)
      &&/終了予定/.test(e)
      &&/次回の練習テーマ/.test(e);
  });
  add('セッションチェック: 終了時に統計から次回テーマを一つ出す',function(){
    if(typeof sessionEndStatsProfile!=='function'||typeof renderSessionEndSummary!=='function')return false;
    const stats={hands:10,vpip:5,pfr:2,limp:3,limpOpp:6,wtsdWent:2,wtsdSaw:8,badDec:2,totalDec:20,scores:[70,72,75,74,73],pfScores:[82,80,78,81],poScores:[55,58,60,57]};
    const p=sessionEndStatsProfile(stats);
    const html=renderSessionEndSummary(stats);
    return /リンプ/.test(p.focus.title+p.focus.body)
      &&/Hands/.test(html)
      &&/PostF/.test(html)
      &&/次回の一点/.test(html);
  });
  add('セッションチェック: 前回の次回テーマを開始前に引き継ぐ',function(){
    if(typeof renderSessionStartChecklist!=='function')return false;
    const html=renderSessionStartChecklist({title:'次回の一点: リバーで降りる力',body:'ワンペアの受けを少し締めます。',tone:'warn'});
    return /前回からの引き継ぎ/.test(html)
      &&/リバーで降りる力/.test(html)
      &&/ワンペアの受け/.test(html)
      &&/今日の終了時間/.test(html);
  });
  add('セッションチェック: 前回テーマからおすすめ練習を出す',function(){
    if(typeof sessionPracticeRecommendation!=='function'||typeof renderSessionPracticeRecommendation!=='function')return false;
    const river=sessionPracticeRecommendation({title:'次回の一点: リバーで降りる力',body:'ワンペアの受けを少し締めます。'});
    const bb=sessionPracticeRecommendation({title:'次回の一点: BB防衛',body:'BBディフェンスを整理します。'});
    const html=renderSessionPracticeRecommendation({title:'次回の一点: ポストフロップで守る',body:'フロップ以降の判断を確認します。'});
    return river&&river.mode==='リングゲーム'&&/リバー/.test(river.focus)
      &&bb&&bb.mode==='トーナメント局面別'&&/BBディフェンス/.test(bb.focus)
      &&/おすすめ練習/.test(html)&&/フロップトレーニング/.test(html);
  });
  add('セッションチェック: おすすめ練習を設定ボタンとして描画する',function(){
    if(typeof renderSessionPracticeRecommendation!=='function')return false;
    const bbHtml=renderSessionPracticeRecommendation({title:'次回の一点: BB防衛',body:'BBディフェンスを整理します。'});
    const riverHtml=renderSessionPracticeRecommendation({title:'次回の一点: リバーで降りる力',body:'ワンペアの受けを少し締めます。'});
    return /session-apply-practice/.test(bbHtml)
      &&/data-mode="tournament"/.test(bbHtml)
      &&/data-focus="bb_defend"/.test(bbHtml)
      &&/data-preset="middle"/.test(bbHtml)
      &&/data-mode="normal"/.test(riverHtml);
  });
  add('セッションチェック: おすすめ練習は行動チェック結果で温度差を出す',function(){
    if(typeof renderSessionPracticeRecommendation!=='function'||typeof sessionPracticeRecommendation!=='function')return false;
    const bb={title:'次回の一点: BB防衛',body:'BBディフェンスを整理します。'};
    const river={title:'次回の一点: リバーで降りる力',body:'WTSDを締めます。'};
    const bbWarn=renderSessionPracticeRecommendation(bb,{hands:12,totalDec:20,badDec:8});
    const riverGood=sessionPracticeRecommendation(river,{hands:12,wtsdSaw:10,wtsdWent:3});
    return /おすすめ練習（継続推奨）/.test(bbWarn)
      &&/前回の行動チェックは「継続」/.test(bbWarn)
      &&riverGood&&riverGood.status==='確認練習'
      &&/崩れないか確認/.test(riverGood.reason);
  });
  add('セッションチェック: 設定したおすすめ練習の狙いを開始前に残す',function(){
    if(typeof storeAppliedPractice!=='function'||typeof renderAppliedPracticeNote!=='function')return false;
    const old=localStorage.getItem(SESSION_APPLIED_PRACTICE_KEY);
    try{
      storeAppliedPractice({mode:'トーナメント局面別',focus:'BBディフェンス練習',status:'継続推奨',reason:'前回の行動チェックは「継続」です。BB防衛をもう一度確認します。',modeValue:'tournament',focusValue:'bb_defend',presetValue:'middle'});
      const html=renderAppliedPracticeNote();
      return /今日の狙い（継続推奨）/.test(html)
        &&/トーナメント局面別 \/ BBディフェンス練習/.test(html)
        &&/前回の行動チェック/.test(html);
    }finally{
      SESSION_APPLIED_PRACTICE_FALLBACK=null;
      if(old==null)localStorage.removeItem(SESSION_APPLIED_PRACTICE_KEY);
      else{
        try{SESSION_APPLIED_PRACTICE_FALLBACK=JSON.parse(old);}catch(e){}
        localStorage.setItem(SESSION_APPLIED_PRACTICE_KEY,old);
      }
    }
  });
  add('セッションチェック: 今日のテーマをHUD用に短くする',function(){
    if(typeof storeAppliedPractice!=='function'||typeof appliedPracticeHudText!=='function')return false;
    const old=localStorage.getItem(SESSION_APPLIED_PRACTICE_KEY);
    try{
      storeAppliedPractice({mode:'リングゲーム',focus:'リバー判断',status:'確認練習',reason:'リバーを確認します。'});
      const txt=appliedPracticeHudText();
      return txt==='今日: リバー判断 / 確認練習';
    }finally{
      SESSION_APPLIED_PRACTICE_FALLBACK=null;
      if(old==null)localStorage.removeItem(SESSION_APPLIED_PRACTICE_KEY);
      else{
        try{SESSION_APPLIED_PRACTICE_FALLBACK=JSON.parse(old);}catch(e){}
        localStorage.setItem(SESSION_APPLIED_PRACTICE_KEY,old);
      }
    }
  });
  add('セッションチェック: 前回テーマの現在地を短く判定する',function(){
    if(typeof sessionFocusProgress!=='function'||typeof renderSessionFocusProgress!=='function')return false;
    const river=sessionFocusProgress({title:'次回の一点: リバーで降りる力',body:'ワンペアの受けを少し締めます。'},{hands:12,wtsdSaw:10,wtsdWent:3});
    const limp=sessionFocusProgress({title:'次回の一点: オープンリンプを減らす',body:'リンプが多めです。'},{hands:8,limpOpp:5,limp:2});
    const post=sessionFocusProgress({title:'次回の一点: ポストフロップで守る',body:'PostFを見ます。'},{hands:8,poScores:[72,70,75,74]});
    const html=renderSessionFocusProgress({title:'次回の一点: リバーで降りる力',body:'ワンペアの受けを少し締めます。'},{hands:12,wtsdSaw:10,wtsdWent:5});
    return river.state==='good'
      &&limp.state==='warn'
      &&post.state==='good'
      &&/session-progress/.test(html)
      &&/WTSD/.test(html);
  });
  add('セッションチェック: 前回テーマ後の増分で現在地を判定する',function(){
    if(typeof sessionStatsSnapshot!=='function'||typeof sessionStatsSinceBaseline!=='function'||typeof sessionFocusProgress!=='function')return false;
    const base=sessionStatsSnapshot({hands:20,wtsdSaw:20,wtsdWent:12,poScores:[50,50,50,50],limpOpp:8,limp:4,totalDec:20,badDec:10});
    const now={hands:30,wtsdSaw:30,wtsdWent:15,poScores:[50,50,50,50,72,74,73,75],limpOpp:12,limp:4,totalDec:32,badDec:12};
    const river=sessionFocusProgress({title:'次回の一点: リバーで降りる力',body:'WTSDを締めます。',baseline:base},now);
    const post=sessionFocusProgress({title:'次回の一点: ポストフロップで守る',body:'PostFを見ます。',baseline:base},now);
    const limp=sessionFocusProgress({title:'次回の一点: オープンリンプを減らす',body:'リンプが多めです。',baseline:base},now);
    const html=renderSessionFocusProgress({title:'次回の一点: リバーで降りる力',body:'WTSDを締めます。',baseline:base},now);
    return river.state==='good'
      &&post.state==='good'
      &&limp.state==='good'
      &&/前回テーマ後/.test(html)
      &&!/60%/.test(html);
  });
  add('セッションチェック: 現在地に判定母数を添える',function(){
    if(typeof sessionFocusProgressSample!=='function'||typeof renderSessionFocusProgress!=='function')return false;
    const base=sessionStatsSnapshot({hands:20,wtsdSaw:20,wtsdWent:12,poScores:[50,50,50,50],limpOpp:8,limp:4,totalDec:20,badDec:10});
    const now={hands:30,wtsdSaw:30,wtsdWent:15,poScores:[50,50,50,50,72,74,73,75],limpOpp:12,limp:4,totalDec:32,badDec:12};
    const river={title:'次回の一点: リバーで降りる力',body:'WTSDを締めます。',baseline:base};
    const post={title:'次回の一点: ポストフロップで守る',body:'PostFを見ます。',baseline:base};
    const html=renderSessionFocusProgress(river,now);
    return /前回後: 10ハンド \/ WTSD機会10/.test(sessionFocusProgressSample(river,now))
      &&/前回後: 10ハンド \/ PostF 4回/.test(sessionFocusProgressSample(post,now))
      &&/<small>前回後: 10ハンド \/ WTSD機会10<\/small>/.test(html);
  });
  add('session checklist: end summary shows why next focus was selected',function(){
    if(typeof sessionEndFocusReason!=='function'||typeof renderSessionEndSummary!=='function')return false;
    const stats={hands:10,vpip:5,pfr:2,limp:3,limpOpp:6,wtsdWent:2,wtsdSaw:8,badDec:2,totalDec:20,scores:[70,72,75,74,73],pfScores:[82,80,78,81],poScores:[55,58,60,57]};
    const p=sessionEndStatsProfile(stats);
    const reason=sessionEndFocusReason(p);
    const html=renderSessionEndSummary(stats);
    return /リンプ率 50%/.test(reason)
      &&/session-focus-reason/.test(html)
      &&/レイズかフォールド/.test(html);
  });
  add('session checklist: end summary separates positive note and next fix',function(){
    if(typeof sessionEndPositiveNote!=='function'||typeof renderSessionEndSummary!=='function')return false;
    const stats={hands:12,vpip:4,pfr:3,limp:0,limpOpp:4,wtsdWent:3,wtsdSaw:10,badDec:1,totalDec:20,scores:[82,84,81,85],pfScores:[76,78,80],poScores:[72,74,70,75]};
    const p=sessionEndStatsProfile(stats);
    const good=sessionEndPositiveNote(p);
    const html=renderSessionEndSummary(stats);
    return /よかった点/.test(good)
      &&/session-focus-good/.test(html)
      &&/session-focus-reason/.test(html)
      &&/次は弱点探し|リンプ|VPIP|PostF|WTSD|ミス/.test(html);
  });
  add('session checklist: end summary closes current focus loop',function(){
    if(typeof sessionEndCarryoverResult!=='function'||typeof renderSessionEndSummary!=='function'||typeof storeSessionNextFocus!=='function')return false;
    const old=localStorage.getItem(SESSION_NEXT_FOCUS_KEY);
    const base=sessionStatsSnapshot({hands:20,wtsdSaw:20,wtsdWent:12,poScores:[50,50,50,50],limpOpp:8,limp:4,totalDec:20,badDec:10});
    const focus={title:'次回の一点: リバーで降りる力',body:'WTSDを締めます。',tone:'warn',baseline:base};
    const now={hands:30,vpip:4,pfr:3,limp:0,limpOpp:4,wtsdSaw:30,wtsdWent:15,badDec:1,totalDec:20,scores:[82,84,81,85],pfScores:[76,78,80],poScores:[50,50,50,50,72,74,73,75]};
    try{
      storeSessionNextFocus(focus);
      const progress=sessionEndCarryoverProgress(focus,now);
      const direct=sessionEndCarryoverResult(focus,now);
      const summary=renderSessionEndSummary(now);
      return progress.state==='good'
        &&/session-focus-result/.test(direct)
        &&/session-focus-result-good/.test(direct)
        &&/session-focus-result/.test(summary);
    }finally{
      SESSION_NEXT_FOCUS_FALLBACK=null;
      if(old==null)localStorage.removeItem(SESSION_NEXT_FOCUS_KEY);
      else{
        try{SESSION_NEXT_FOCUS_FALLBACK=JSON.parse(old);}catch(e){}
        localStorage.setItem(SESSION_NEXT_FOCUS_KEY,old);
      }
    }
  });
  add('session checklist: focus history stores recent theme result',function(){
    if(typeof appendSessionFocusHistory!=='function'||typeof renderSessionFocusHistory!=='function'||typeof getSessionFocusHistory!=='function')return false;
    const old=localStorage.getItem(SESSION_FOCUS_HISTORY_KEY);
    const oldFallback=SESSION_FOCUS_HISTORY_FALLBACK;
    const base=sessionStatsSnapshot({hands:20,wtsdSaw:20,wtsdWent:12,poScores:[50,50,50,50],limpOpp:8,limp:4,totalDec:20,badDec:10});
    const focus={title:'次回の一点: リバーで降りる力',body:'WTSDを締めます。',tone:'warn',baseline:base};
    const now={hands:30,wtsdSaw:30,wtsdWent:15,poScores:[50,50,50,50,72,74,73,75],limpOpp:12,limp:4,totalDec:32,badDec:12};
    try{
      SESSION_FOCUS_HISTORY_FALLBACK=[];
      localStorage.removeItem(SESSION_FOCUS_HISTORY_KEY);
      const entry=appendSessionFocusHistory(focus,now);
      const list=getSessionFocusHistory();
      const html=renderSessionFocusHistory(list);
      return entry&&entry.state==='good'
        &&list.length===1
        &&/session-history/.test(html)
        &&/成長ログ/.test(html)
        &&/session-growth-summary/.test(html)
        &&/session-history-good/.test(html)
        &&/リバーで降りる力/.test(html);
    }finally{
      SESSION_FOCUS_HISTORY_FALLBACK=oldFallback||[];
      if(old==null)localStorage.removeItem(SESSION_FOCUS_HISTORY_KEY);
      else localStorage.setItem(SESSION_FOCUS_HISTORY_KEY,old);
    }
  });
  add('session checklist: growth log summarizes improvement flow',function(){
    if(typeof sessionFocusGrowthSummary!=='function'||typeof renderSessionFocusHistory!=='function')return false;
    const list=[
      {title:'リバーで降りる力',state:'good',sample:'前回後: 10ハンド / WTSD機会10'},
      {title:'リバーで降りる力',state:'warn',sample:'前回後: 10ハンド / WTSD機会10'},
      {title:'入口を締める',state:'improving',sample:'8ハンド'}
    ];
    const txt=sessionFocusGrowthSummary(list);
    const html=renderSessionFocusHistory(list);
    return /継続課題から達成/.test(txt)
      &&/良い流れ/.test(txt)
      &&/成長ログ/.test(html)
      &&/継続課題から達成/.test(html);
  });
  add('session checklist: repeated unfinished focus continues next theme',function(){
    if(typeof sessionEndStatsProfile!=='function'||typeof sessionFocusRepeatCandidate!=='function')return false;
    const old=localStorage.getItem(SESSION_FOCUS_HISTORY_KEY);
    const oldFallback=SESSION_FOCUS_HISTORY_FALLBACK;
    try{
      SESSION_FOCUS_HISTORY_FALLBACK=[
        {title:'リバーで降りる力',state:'warn',sample:'前回後: 8ハンド / WTSD機会6'},
        {title:'リバーで降りる力',state:'improving',sample:'前回後: 10ハンド / WTSD機会7'},
        {title:'入口を締める',state:'good',sample:'前回後: 12ハンド'}
      ];
      localStorage.removeItem(SESSION_FOCUS_HISTORY_KEY);
      const stats={hands:12,vpip:4,pfr:3,limp:0,limpOpp:4,wtsdWent:3,wtsdSaw:10,badDec:1,totalDec:20,scores:[82,84,81,85],pfScores:[76,78,80],poScores:[72,74,70,75]};
      const repeat=sessionFocusRepeatCandidate();
      const p=sessionEndStatsProfile(stats);
      return repeat&&repeat.count===2
        &&p.historyRepeat&&p.historyRepeat.count===2
        &&/リバーで降りる力/.test(p.focus.title)
        &&/同じテーマ/.test(sessionEndFocusReason(p));
    }finally{
      SESSION_FOCUS_HISTORY_FALLBACK=oldFallback||[];
      if(old==null)localStorage.removeItem(SESSION_FOCUS_HISTORY_KEY);
      else localStorage.setItem(SESSION_FOCUS_HISTORY_KEY,old);
    }
  });
  add('session checklist: focus becomes one-hand action plan',function(){
    if(typeof sessionFocusActionChecklist!=='function'||typeof renderSessionFocusActionChecklist!=='function'||typeof renderSessionStartChecklist!=='function')return false;
    const river={title:'次回の一点: リバーで降りる力',body:'WTSDを締めます。',tone:'warn'};
    const post={title:'次回の一点: ポストフロップで守る',body:'PostFを見ます。',tone:'warn'};
    const riverItems=sessionFocusActionChecklist(river);
    const postItems=sessionFocusActionChecklist(post);
    const html=renderSessionStartChecklist(river);
    return riverItems.length===3
      &&postItems.length===3
      &&/バリュー候補を3つ/.test(riverItems.join(' '))
      &&/何にコールしてほしいか/.test(postItems.join(' '))
      &&/session-action-plan/.test(html)
      &&/次の1ハンドで見ること/.test(html);
  });
  add('session checklist: end summary reviews action plan result',function(){
    if(typeof sessionFocusActionResult!=='function'||typeof renderSessionFocusActionResult!=='function'||typeof renderSessionEndSummary!=='function')return false;
    const old=localStorage.getItem(SESSION_NEXT_FOCUS_KEY);
    const base=sessionStatsSnapshot({hands:20,wtsdSaw:20,wtsdWent:12,poScores:[50,50,50,50],limpOpp:8,limp:4,totalDec:20,badDec:10});
    const focus={title:'次回の一点: リバーで降りる力',body:'WTSDを締めます。',tone:'warn',baseline:base};
    const goodStats={hands:30,wtsdSaw:30,wtsdWent:15,poScores:[50,50,50,50,72,74,73,75],limpOpp:12,limp:4,totalDec:32,badDec:12};
    const badStats={hands:30,wtsdSaw:30,wtsdWent:19,poScores:[50,50,50,50,62,64,63,65],limpOpp:12,limp:4,totalDec:32,badDec:12};
    try{
      storeSessionNextFocus(focus);
      const good=sessionFocusActionResult(focus,goodStats);
      const bad=sessionFocusActionResult(focus,badStats);
      const html=renderSessionEndSummary(goodStats,focus);
      return good&&good.state==='good'
        &&bad&&bad.state==='warn'
        &&/session-action-result/.test(renderSessionFocusActionResult(focus,goodStats))
        &&/行動チェック/.test(html)
        &&/バリュー候補/.test(html);
    }finally{
      SESSION_NEXT_FOCUS_FALLBACK=null;
      if(old==null)localStorage.removeItem(SESSION_NEXT_FOCUS_KEY);
      else{
        try{SESSION_NEXT_FOCUS_FALLBACK=JSON.parse(old);}catch(e){}
        localStorage.setItem(SESSION_NEXT_FOCUS_KEY,old);
      }
    }
  });
  add('session checklist: end summary adds player-facing closing note',function(){
    if(typeof sessionFocusClosingNote!=='function'||typeof renderSessionEndSummary!=='function')return false;
    const base=sessionStatsSnapshot({hands:20,wtsdSaw:20,wtsdWent:12});
    const focus={title:'次回の一点: リバーで降りる力',body:'WTSDを締めます。',tone:'warn',baseline:base};
    const good=sessionFocusClosingNote(focus,{hands:30,wtsdSaw:30,wtsdWent:15});
    const warn=sessionFocusClosingNote(focus,{hands:30,wtsdSaw:30,wtsdWent:25});
    const html=renderSessionEndSummary({hands:30,wtsdSaw:30,wtsdWent:15},focus);
    return /かなり守れました/.test(good)
      &&/まだ残っています/.test(warn)
      &&/session-closing-note/.test(html)
      &&/別の弱点へ広げてもよい/.test(html);
  });
  add('session checklist: action result uses mode specific metrics',function(){
    if(typeof sessionFocusActionResult!=='function'||typeof sessionFocusModeKey!=='function')return false;
    const river={title:'次回の一点: リバーで降りる力',body:'WTSDを締めます。'};
    const bb={title:'次回の一点: BB防衛',body:'BBディフェンスを整理します。'};
    const flop={title:'次回の一点: ポストフロップで守る',body:'PostFを見ます。'};
    const riverGood=sessionFocusActionResult(river,{hands:12,wtsdSaw:10,wtsdWent:3});
    const bbGood=sessionFocusActionResult(bb,{hands:12,totalDec:20,badDec:3});
    const bbWarn=sessionFocusActionResult(bb,{hands:12,totalDec:20,badDec:8});
    const flopGood=sessionFocusActionResult(flop,{hands:12,poScores:[72,74,75,73]});
    const flopWarn=sessionFocusActionResult(flop,{hands:12,poScores:[50,55,58,57]});
    return sessionFocusModeKey(river)==='ring_river'
      &&sessionFocusModeKey(bb)==='tournament_bb_defense'
      &&sessionFocusModeKey(flop)==='flop_bet_plan'
      &&riverGood&&riverGood.state==='good'
      &&bbGood&&bbGood.state==='good'&&/トーナメントのBB防衛/.test(bbGood.body)
      &&bbWarn&&bbWarn.state==='warn'
      &&flopGood&&flopGood.state==='good'&&/フロップトレーニング/.test(flopGood.body)
      &&flopWarn&&flopWarn.state==='warn';
  });
  const fourBetBaseDecisions=function(extraHeroAction){
    const ds=[
      regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:5,facingRaise:false,position:'UTG+1',playerName:'utg1',isHuman:false,playerIdx:1,playerChipsBefore:650,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
      regressionDecision({street:'preflop',action:'raise',amount:45,pot:22,toCall:13,facingRaise:true,position:'SB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500,pfRaiseCountBefore:1,pfHumanRaisedBefore:false,pfFacingBetLevel:2,pfActionBetLevel:3}),
      regressionDecision({street:'preflop',action:'allin',amount:250,pot:67,toCall:30,facingRaise:true,position:'UTG+1',playerName:'utg1',isHuman:false,playerIdx:1,playerChipsBefore:635,pfRaiseCountBefore:2,pfFacingBetLevel:3,pfActionBetLevel:4})
    ];
    ds.push(extraHeroAction);
    return ds;
  };

  add('4BETコールをコールドコール扱いしない',function(){
    const hr=regressionHand({
      heroHole:['Ah','Kd'],
      villainHole:['Qs','Qh'],
      decisions:fourBetBaseDecisions(regressionDecision({street:'preflop',action:'call',amount:205,pot:317,toCall:205,potOdds:205/(317+205),facingRaise:true,position:'SB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:455,playerBetBefore:45,pfRaiseCountBefore:3,pfHumanRaisedBefore:true,pfFacingBetLevel:4,pfActionBetLevel:4}))
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.lineContext==='4BET対応コール'&&/5bet|5BET/i.test((ev.suggest||'')+' '+(ev.strategyMix||'')));
  });

  add('4BET後の再レイズは5BET文脈で評価する',function(){
    const hr=regressionHand({
      heroHole:['As','Ah'],
      villainHole:['Ks','Kh'],
      decisions:fourBetBaseDecisions(regressionDecision({street:'preflop',action:'allin',amount:455,pot:317,toCall:205,potOdds:205/(317+205),facingRaise:true,position:'SB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:455,playerBetBefore:45,pfRaiseCountBefore:3,pfHumanRaisedBefore:true,pfFacingBetLevel:4,pfActionBetLevel:5}))
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='allin');
    return !!(ev&&/5BET|5bet/i.test((ev.comment||'')+' '+(ev.suggest||'')+' '+(ev.strategyMix||'')));
  });

  add('4BET側が最後のアグレッサーならOOPチェックをドンクミス扱いしない',function(){
    const ds=fourBetBaseDecisions(regressionDecision({street:'preflop',action:'call',amount:205,pot:317,toCall:205,potOdds:205/(317+205),facingRaise:true,position:'SB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:455,playerBetBefore:45,pfRaiseCountBefore:3,pfHumanRaisedBefore:true,pfFacingBetLevel:4,pfActionBetLevel:4}));
    ds.push(regressionDecision({street:'flop',action:'check',amount:0,pot:522,toCall:0,facingRaise:false,position:'SB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:250,playerBetBefore:0}));
    const hr=regressionHand({heroHole:['As','Ah'],villainHole:['Ks','Kh'],board:['Kd','7c','2s'],decisions:ds,pot:522});
    const ev=humanEval(analyzeHand(hr),e=>e.street==='flop'&&e.action==='check');
    return !!(ev&&ev.quality!=='bad'&&(ev.deduction||0)<=8);
  });

  add('トーナメント20BBの2BBオープンをサイズミス扱いしない',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:20,players:8,sb:2,bb:5,bbAnte:5,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['Ah','Kd'],
      board:[],
      tournamentContext:ctx,
      bigBlind:5,
      decisions:[regressionDecision({street:'preflop',action:'raise',amount:10,pot:12,toCall:5,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:100,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2})]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='raise');
    return !!(ev&&ev.quality!=='bad'&&(ev.deduction||0)<=6);
  });

  add('トーナメント評価に構造化レンジ判定を付与する',function(){
    const ctx={enabled:true,phase:'中盤',stackBB:20,players:8,sb:2,bb:5,bbAnte:5,bbAnteBB:1,focusId:'bbante_steal',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['Ah','Kd'],
      tournamentContext:ctx,
      bigBlind:5,
      decisions:[regressionDecision({street:'preflop',action:'raise',amount:10,pot:12,toCall:5,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:100,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2})]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='raise');
    return !!(ev&&ev.tournamentRangeProfile&&ev.tournamentRangeProfile.lane==='open'&&ev.tournamentRangeProfile.severity==='good');
  });

  add('序盤EPのドミネート系オフスーツ参加を専用プロファイルで検出する',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:40,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['Qs','To'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:500,pot:500,toCall:200,facingRaise:false,position:'UTG',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:8000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='raise');
    return !!(ev&&ev.earlyProfile&&ev.earlyProfile.severity==='bad'&&/ドミネート/.test((ev.earlyProfile.risks||[]).join(''))&&/序盤参加/.test(ev.phaseWeightNote||''));
  });

  add('序盤BTNの自然なオープンは広すぎ扱いしない',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:40,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['As','9s'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:500,pot:500,toCall:200,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:8000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='raise');
    return !!(ev&&ev.earlyProfile&&ev.earlyProfile.severity!=='bad'&&ev.earlyProfile.lane==='open');
  });

  add('序盤のオープンリンプをリンプ癖として重く見る',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:40,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['Ks','Qs'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'call',amount:200,pot:500,toCall:200,facingRaise:false,position:'HJ',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:8000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:0})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.earlyProfile&&ev.earlyProfile.lane==='limp'&&/リンプ/.test(ev.earlyProfile.participationLeak||'')&&/オープンリンプ/.test(ev.phaseWeightNote||'')&&(ev.deduction||0)>=10);
  });

  add('序盤の小ポケットコールドコールはセットマイン例外を保持する',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:40,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['5s','5d'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:500,pot:500,toCall:200,facingRaise:false,position:'HJ',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:9000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:500,pot:1000,toCall:500,potOdds:500/1500,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:8000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.earlyProfile&&ev.earlyProfile.lane==='flat'&&ev.earlyProfile.exceptionReason&&/セットマイン/.test(ev.earlyProfile.exceptionReason)&&ev.earlyProfile.severity!=='bad');
  });

  add('序盤セットマインは高すぎるコールなら例外扱いしない',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:40,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['5s','5d'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:1200,pot:500,toCall:200,facingRaise:false,position:'HJ',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:5000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:1200,pot:1700,toCall:1200,potOdds:1200/2900,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:8000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.earlyProfile&&ev.earlyProfile.speculative&&ev.earlyProfile.speculative.type==='setMine'&&ev.earlyProfile.speculative.status==='bad'&&!ev.earlyProfile.exceptionReason);
  });

  add('序盤後ろ位置の安いスーテッド連結flatは条件付き例外にする',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:45,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['8s','7s'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:500,pot:500,toCall:200,facingRaise:false,position:'HJ',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:9000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:500,pot:1000,toCall:500,potOdds:500/1500,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:9000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.earlyProfile&&ev.earlyProfile.speculative&&ev.earlyProfile.speculative.type==='suitedConnector'&&ev.earlyProfile.speculative.status==='good'&&/スーテッド連結/.test(ev.earlyProfile.exceptionReason||''));
  });

  add('序盤OOPのスーテッド連結flatは条件不足として扱う',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:40,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['8s','7s'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:500,pot:500,toCall:200,facingRaise:false,position:'UTG',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:9000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:500,pot:1000,toCall:500,potOdds:500/1500,facingRaise:true,position:'SB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:8000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.earlyProfile&&ev.earlyProfile.speculative&&ev.earlyProfile.speculative.type==='suitedConnector'&&ev.earlyProfile.speculative.status==='bad'&&!ev.earlyProfile.exceptionReason);
  });

  add('序盤マルチウェイの弱ワンペア大きめベットを重く見る',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:40,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const players=[
      regressionPlayer('あなた',true,['8s','7s'],{chips:8000}),
      regressionPlayer('a',false,['Ah','Kd'],{chips:8000}),
      regressionPlayer('b',false,['Qs','Qd'],{chips:8000}),
      regressionPlayer('c',false,['Jc','Jh'],{chips:8000})
    ];
    const hr=regressionHand({
      players,
      board:['Ts','7c','4d'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'flop',action:'raise',amount:700,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:8000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='flop'&&e.action==='raise');
    return !!(ev&&ev.earlyMultiwayProfile&&ev.earlyMultiwayProfile.players>=4&&ev.earlyMultiwayProfile.severity==='bad'&&/序盤マルチウェイ/.test(ev.phaseWeightNote||''));
  });

  add('序盤マルチウェイの弱ワンペアチェックを自然なポット管理として扱う',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:40,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const players=[
      regressionPlayer('あなた',true,['8s','7s'],{chips:8000}),
      regressionPlayer('a',false,['Ah','Kd'],{chips:8000}),
      regressionPlayer('b',false,['Qs','Qd'],{chips:8000}),
      regressionPlayer('c',false,['Jc','Jh'],{chips:8000})
    ];
    const hr=regressionHand({
      players,
      board:['Ts','7c','4d'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'flop',action:'check',amount:0,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:8000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='flop'&&e.action==='check');
    return !!(ev&&ev.earlyMultiwayProfile&&ev.earlyMultiwayProfile.lane==='check'&&ev.earlyMultiwayProfile.severity==='good'&&ev.quality!=='bad');
  });

  add('序盤マルチウェイのワンペアコールを受けすぎ候補として分類する',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:40,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const players=[
      regressionPlayer('あなた',true,['8s','7s'],{chips:8000}),
      regressionPlayer('a',false,['Ah','Kd'],{chips:8000}),
      regressionPlayer('b',false,['Qs','Qd'],{chips:8000}),
      regressionPlayer('c',false,['Jc','Jh'],{chips:8000})
    ];
    const hr=regressionHand({
      players,
      board:['Ts','7c','4d'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'flop',action:'raise',amount:700,pot:1000,toCall:0,facingRaise:false,position:'BTN',playerName:'a',isHuman:false,playerIdx:1,playerChipsBefore:8000}),
        regressionDecision({street:'flop',action:'call',amount:700,pot:1700,toCall:700,potOdds:700/2400,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:8000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='flop'&&e.action==='call');
    return !!(ev&&ev.earlyMultiwayProfile&&ev.earlyMultiwayProfile.lane==='call'&&ev.earlyMultiwayProfile.onePair&&ev.earlyMultiwayProfile.severity==='bad');
  });

  add('序盤深いSPRの弱ワンペア大きめベットを過信として見る',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:60,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['8s','7s'],
      villainHole:['Ah','Kd'],
      board:['Ts','7c','4d'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'flop',action:'raise',amount:700,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:12000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='flop'&&e.action==='raise');
    return !!(ev&&ev.earlyDeepSprProfile&&ev.earlyDeepSprProfile.spr>=10&&ev.earlyDeepSprProfile.severity==='bad'&&/深いSPR/.test(ev.phaseWeightNote||''));
  });

  add('序盤深いSPRのワンペアチェックを自然なポット管理として扱う',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:60,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Ah','Kd'],
      board:['Ts','9s','4d'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'flop',action:'check',amount:0,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:12000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='flop'&&e.action==='check');
    return !!(ev&&ev.earlyDeepSprProfile&&ev.earlyDeepSprProfile.lane==='check'&&ev.earlyDeepSprProfile.severity==='good'&&ev.quality!=='bad');
  });

  add('序盤深いSPRの弱ワンペア大きいコールを受けすぎ候補にする',function(){
    const ctx={enabled:true,phase:'序盤',stackBB:60,players:8,playersLeft:32,seatsPaid:6,sb:100,bb:200,bbAnte:200,bbAnteBB:1,focusId:'bbante_basic',focusLabel:'BBアンティ基礎'};
    const hr=regressionHand({
      heroHole:['8s','7s'],
      villainHole:['Ah','Kd'],
      board:['Ts','7c','4d'],
      bigBlind:200,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'flop',action:'raise',amount:800,pot:1000,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:12000}),
        regressionDecision({street:'flop',action:'call',amount:800,pot:1800,toCall:800,potOdds:800/2600,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:14000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='flop'&&e.action==='call');
    return !!(ev&&ev.earlyDeepSprProfile&&ev.earlyDeepSprProfile.lane==='call'&&ev.earlyDeepSprProfile.severity==='bad');
  });

  add('中盤18〜25BBの非BBフラットを専用プロファイルで重く見る',function(){
    const ctx={enabled:true,phase:'中盤',stackBB:20,players:8,playersLeft:14,seatsPaid:3,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'reshove20',focusLabel:'20BB reshove練習'};
    const hr=regressionHand({
      heroHole:['Qs','To'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:2200,pot:2500,toCall:1000,facingRaise:false,position:'HJ',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:24000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:2200,pot:4700,toCall:2200,potOdds:2200/6900,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:20000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.middleProfile&&ev.middleProfile.band==='18〜25BB resteal帯'&&ev.middleProfile.lane==='flat'&&/非BBフラット/.test(ev.phaseWeightNote||'')&&(ev.deduction||0)>=16);
  });

  add('中盤11〜14BBの後ろ寄りopen jamを自然な選択肢として扱う',function(){
    const ctx={enabled:true,phase:'中盤',stackBB:14,players:8,playersLeft:14,seatsPaid:3,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'openjam14',focusLabel:'14BB open jam練習'};
    const hr=regressionHand({
      heroHole:['As','5s'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:14000,pot:2500,toCall:1000,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:14000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='allin');
    return !!(ev&&ev.middleProfile&&ev.middleProfile.band==='11〜14BB open jam混合'&&ev.middleProfile.lane==='openJam'&&ev.quality!=='bad');
  });

  add('中盤BB防衛は非BBフラットと別レーンで扱う',function(){
    const ctx={enabled:true,phase:'中盤',stackBB:20,players:8,playersLeft:14,seatsPaid:3,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'bb_defend',focusLabel:'BBディフェンス練習'};
    const hr=regressionHand({
      heroHole:['Jc','9c'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:2200,pot:2500,toCall:1000,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:24000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:1200,pot:4700,toCall:1200,potOdds:1200/5900,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:20000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.middleProfile&&ev.middleProfile.lane==='bbDefend'&&ev.quality!=='bad');
  });

  add('中盤5軸の1番としてopenサイズを判定する',function(){
    const ctx={enabled:true,phase:'中盤',stackBB:22,players:8,playersLeft:14,seatsPaid:3,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'reshove20',focusLabel:'20BB reshove練習'};
    const hr=regressionHand({
      heroHole:['As','Jd'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:4000,pot:2500,toCall:1000,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:22000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='raise');
    return !!(ev&&ev.middleProfile&&ev.middleProfile.openSizeVerdict==='大きすぎ'&&/openサイズ/.test(ev.middleProfile.deepAxes[0]));
  });

  add('中盤5軸の2番としてBBアンティ圧を保持する',function(){
    const ctx={enabled:true,phase:'中盤',stackBB:20,players:8,playersLeft:14,seatsPaid:3,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'bb_defend',focusLabel:'BBディフェンス練習'};
    const hr=regressionHand({
      heroHole:['8s','7s'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:2200,pot:2500,toCall:1000,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:24000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:1200,pot:4700,toCall:1200,potOdds:1200/5900,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:20000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.middleProfile&&ev.middleProfile.antePressure==='高'&&ev.middleProfile.initialPotBB===2.5&&/BBアンティ圧=高/.test(ev.middleProfile.deepAxes[1]));
  });

  add('中盤5軸の3番としてreshoveレーンを明示する',function(){
    const ctx={enabled:true,phase:'中盤',stackBB:16,players:8,playersLeft:14,seatsPaid:3,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'reshove20',focusLabel:'20BB reshove練習'};
    const hr=regressionHand({
      heroHole:['As','5s'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:2200,pot:2500,toCall:1000,facingRaise:false,position:'CO',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:26000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'allin',amount:16000,pot:4700,toCall:2200,potOdds:2200/6900,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:16000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='allin');
    return !!(ev&&ev.middleProfile&&ev.middleProfile.lane==='reshove'&&/reshove/.test(ev.middleProfile.deepAxes[2]));
  });

  add('中盤5軸の4番としてドミネート系flat罠を強める',function(){
    const ctx={enabled:true,phase:'中盤',stackBB:20,players:8,playersLeft:14,seatsPaid:3,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'reshove20',focusLabel:'20BB reshove練習'};
    const hr=regressionHand({
      heroHole:['Qs','To'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:2200,pot:2500,toCall:1000,facingRaise:false,position:'HJ',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:26000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:2200,pot:4700,toCall:2200,potOdds:2200/6900,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:20000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.middleProfile&&ev.middleProfile.handShape==='ドミネートされやすいオフスーツ'&&ev.middleProfile.flatMultiplier>=1.30&&/flat罠/.test(ev.middleProfile.deepAxes[3]));
  });

  add('中盤5軸の5番として低SPRポストフロップを保持する',function(){
    const ctx={enabled:true,phase:'中盤',stackBB:18,players:8,playersLeft:14,seatsPaid:3,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'general',focusLabel:'総合練習'};
    const hr=regressionHand({
      heroHole:['Qs','Td'],
      villainHole:['Ah','Kh'],
      board:['Tc','4c','9d','8c','5h'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:3000,pot:6000,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:12000}),
        regressionDecision({street:'river',action:'call',amount:3000,pot:9000,toCall:3000,potOdds:3000/12000,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:5000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='river'&&e.action==='call');
    return !!(ev&&ev.middleProfile&&ev.middleProfile.postflopSPR!==null&&ev.middleProfile.postflopSPR<=1&&/低SPR/.test(ev.middleProfile.deepAxes[4]));
  });

  add('バブルでカバーされる薄い非BBコールはフェーズ補正で重く見る',function(){
    const ctx={enabled:true,phase:'バブル',stackBB:14,players:9,playersLeft:9,seatsPaid:6,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'bubble_call',focusLabel:'バブル薄コール回避'};
    const hr=regressionHand({
      heroHole:['Qs','To'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:2000,pot:2500,toCall:1000,facingRaise:false,position:'HJ',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:26000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:2000,pot:4500,toCall:2000,potOdds:2000/6500,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:14000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高'})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.tournamentPhaseAxis==='バブルのICM/カバー関係'&&/バブル/.test(ev.phaseWeightNote||'')&&(ev.deduction||0)>=14);
  });

  add('バブルのカバーされているミドルを立場分類する',function(){
    const ctx={enabled:true,phase:'バブル',stackBB:18,players:9,playersLeft:7,seatsPaid:3,avgStackBB:17,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'bubble_call',focusLabel:'バブル薄コール回避'};
    const hr=regressionHand({
      heroHole:['Qs','To'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:2000,pot:2500,toCall:1000,facingRaise:false,position:'HJ',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:42000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:2000,pot:4500,toCall:2000,potOdds:2000/6500,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:18000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高'})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.bubbleProfile&&ev.bubbleProfile.archetype==='カバーされているミドル'&&/ミドル同士|即終了/.test((ev.phaseWeightNote||'')+' '+(ev.bubbleProfile.risk||'')));
  });

  add('バブルで下位スタックがいるミドルのオールイン受けをさらに重く見る',function(){
    const ctx={enabled:true,phase:'バブル',stackBB:18,players:9,playersLeft:4,seatsPaid:3,avgStackBB:17,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'bubble_call',focusLabel:'バブル薄コール回避'};
    const hr=regressionHand({
      heroHole:['Qs','To'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:22000,pot:2500,toCall:1000,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:42000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:18000,pot:24500,toCall:18000,potOdds:18000/42500,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:18000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'mixed_covered',coverLabel:'上位スタックあり',coverPressure:'高',coverCount:1,coveredByCount:1})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.bubbleProfile&&ev.bubbleProfile.shorterExists&&ev.bubbleProfile.stage==='直接バブル'&&/オールイン受け/.test(ev.phaseWeightNote||'')&&(ev.deduction||0)>=35);
  });

  add('バブルICM表で同じ66でも押す側と受ける側を分ける',function(){
    const ctx={enabled:true,phase:'バブル',stackBB:14,players:9,playersLeft:7,seatsPaid:3,avgStackBB:12,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'bubble_call',focusLabel:'バブル薄コール回避'};
    const pushHr=regressionHand({
      heroHole:['6s','6d'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:14000,pot:2500,toCall:1000,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:14000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2,coverState:'covering',coverLabel:'カバーしている',coverPressure:'攻め可',coverCount:2,coveredByCount:0})
      ]
    });
    const callHr=regressionHand({
      heroHole:['6s','6d'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:22000,pot:2500,toCall:1000,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:30000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:14000,pot:24500,toCall:14000,potOdds:14000/38500,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:14000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',coverCount:1,coveredByCount:1})
      ]
    });
    const pushEv=humanEval(analyzeHand(pushHr),e=>e.action==='allin');
    const callEv=humanEval(analyzeHand(callHr),e=>e.action==='call');
    return !!(pushEv&&callEv&&pushEv.bubbleIcmRange&&callEv.bubbleIcmRange&&pushEv.bubbleIcmRange.severity!=='bad'&&callEv.bubbleIcmRange.severity==='bad');
  });

  add('バブル評価用に最短ショートと次BB距離を計算する',function(){
    const ps=[
      regressionPlayer('hero',true,['As','Kd'],{chips:18000}),
      regressionPlayer('big',false,['2s','2d'],{chips:42000}),
      regressionPlayer('short',false,['3s','3d'],{chips:5000}),
      regressionPlayer('mid',false,['4s','4d'],{chips:12000})
    ];
    const info=tournamentStackPressureInfo(ps[0],ps,1000,2);
    return !!(info&&info.shortestOppStackBB===5&&info.shorterStackCount===2&&info.bbInHands===0&&info.nextBBPressure==='現在BB');
  });

  add('バブルの強ハンドフォールド減点はICMで軽くなる',function(){
    const ctx={enabled:true,phase:'バブル',stackBB:14,players:9,playersLeft:9,seatsPaid:6,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'bubble_call',focusLabel:'バブル薄コール回避'};
    const hr=regressionHand({
      heroHole:['Ah','Kd'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:14000,pot:2500,toCall:1000,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:26000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:16500,toCall:14000,potOdds:14000/30500,facingRaise:true,position:'SB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:14000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高'})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='fold');
    return !!(ev&&ev.tournamentPhaseAxis==='バブルのICM/カバー関係'&&/フォールド/.test(ev.phaseWeightNote||'')&&(ev.deduction||0)>0&&(ev.deduction||0)<20);
  });

  add('バブルでカバーしているビッグの攻撃は立場補正で軽く見る',function(){
    const ctx={enabled:true,phase:'バブル',stackBB:14,players:9,playersLeft:7,seatsPaid:3,avgStackBB:8,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'openjam14',focusLabel:'14BB open jam練習'};
    const hr=regressionHand({
      heroHole:['7s','2d'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:14000,pot:2500,toCall:1000,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:14000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2,coverState:'covering',coverLabel:'カバーしている',coverPressure:'攻め可'})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='allin');
    return !!(ev&&ev.bubbleProfile&&ev.bubbleProfile.archetype==='カバーしているビッグ'&&/攻撃/.test(ev.phaseWeightNote||'')&&(ev.deduction||0)>0&&(ev.deduction||0)<=11);
  });

  add('HUでは降りすぎをフェーズ補正で重く見る',function(){
    const ctx={enabled:true,phase:'HU',stackBB:20,players:2,playersLeft:2,seatsPaid:1,sb:500,bb:1000,bbAnte:0,bbAnteBB:0,focusId:'general',focusLabel:'総合練習'};
    const hr=regressionHand({
      heroHole:['Ks','To'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:1500,toCall:500,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:20000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:0})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='fold');
    return !!(ev&&ev.tournamentPhaseAxis==='HUの広いレンジ/降りすぎ抑制'&&ev.headsUpProfile&&ev.headsUpProfile.lane==='sbFold'&&/HU/.test(ev.phaseWeightNote||'')&&(ev.deduction||0)>=18);
  });

  add('FTではカバーされる薄いオールイン受けを専用軸で重く見る',function(){
    const ctx={enabled:true,phase:'FT',stackBB:22,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Qh','7h'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:36000,pot:4000,toCall:1600,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:42000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:30000,pot:40000,toCall:30000,potOdds:30000/70000,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:30000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:4,shorterStackCount:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.tournamentPhaseAxis==='FTのペイジャンプ/スタック順位'&&ev.finalTableProfile&&ev.finalTableProfile.lane==='callOff'&&/FT/.test(ev.phaseWeightNote||'')&&(ev.deduction||0)>=18);
  });

  add('FT立場分類: チップリーダーの先制攻撃はカバー圧として扱う',function(){
    const ctx={enabled:true,phase:'FT',stackBB:34,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['As','8s'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:3600,pot:4000,toCall:1600,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:54400,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2,coverState:'covering',coverLabel:'カバーしている',coverPressure:'高',stackRank:1,shorterStackCount:5,coverCount:5,coveredByCount:0})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='raise');
    return !!(ev&&ev.finalTableProfile&&ev.finalTableProfile.stackRole==='チップリーダー'&&ev.finalTableProfile.lane==='open'&&ev.finalTableProfile.deepAxes&&ev.finalTableProfile.deepAxes.includes('立場=チップリーダー')&&ev.finalTableProfile.multiplier<1);
  });

  add('FT立場分類: ミドルはカバーされる薄い受けを最重視する',function(){
    const ctx={enabled:true,phase:'FT',stackBB:19,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Ks','9d'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:48000,pot:4000,toCall:1600,facingRaise:false,position:'CO',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:52000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:30400,pot:52000,toCall:30400,potOdds:30400/82400,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:30400,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:4,shorterStackCount:2,coverCount:2,coveredByCount:3})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.finalTableProfile&&ev.finalTableProfile.stackRole==='ミドル'&&ev.finalTableProfile.lane==='callOff'&&ev.finalTableProfile.multiplier>1.55);
  });

  add('FT立場分類: 最短ショートは降りすぎ警告を強める',function(){
    const ctx={enabled:true,phase:'FT',stackBB:7,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Kc','9c'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:4000,toCall:1600,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:11200,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:0,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:6,shorterStackCount:0,coverCount:0,coveredByCount:5,shortestOppStackBB:10})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='fold');
    return !!(ev&&ev.finalTableProfile&&ev.finalTableProfile.stackRole==='最短ショート'&&ev.finalTableProfile.lane==='missedSteal'&&ev.finalTableProfile.multiplier>1.25&&/最短ショート/.test(tournamentFinalTableProfileText(ev.finalTableProfile)));
  });

  add('FT衝突相手: ミドルが上位カバーを受けるコールをさらに重く見る',function(){
    const ctx={enabled:true,phase:'FT',stackBB:20,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Ah','9d'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:72000,pot:4000,toCall:1600,facingRaise:false,position:'BTN',playerName:'CL',isHuman:false,playerIdx:1,playerChipsBefore:72000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:32000,pot:76000,toCall:32000,potOdds:32000/108000,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:32000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:4,shorterStackCount:2,coverCount:2,coveredByCount:3,villainChipsBefore:72000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.finalTableProfile&&ev.finalTableProfile.collisionProfile&&ev.finalTableProfile.collisionProfile.opponent==='上位カバー'&&ev.finalTableProfile.multiplier>1.75&&/上位カバー/.test((ev.phaseWeightNote||'')+' '+ev.finalTableProfile.risk));
  });

  add('FT衝突相手: カバー側がショートを受ける時はCL級受けと分ける',function(){
    const ctx={enabled:true,phase:'FT',stackBB:36,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Ad','Ts'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:11200,pot:4000,toCall:1600,facingRaise:false,position:'CO',playerName:'short',isHuman:false,playerIdx:1,playerChipsBefore:11200,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:11200,pot:15200,toCall:11200,potOdds:11200/26400,facingRaise:true,facingAllIn:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:57600,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covering',coverLabel:'カバーしている',coverPressure:'攻め可',stackRank:1,shorterStackCount:5,coverCount:5,coveredByCount:0,villainChipsBefore:11200})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.finalTableProfile&&ev.finalTableProfile.stackRole==='チップリーダー'&&ev.finalTableProfile.collisionProfile&&ev.finalTableProfile.collisionProfile.opponent==='ショート'&&ev.finalTableProfile.multiplier<1);
  });

  add('FT衝突相手: セカンドがCL級とぶつかる受けを危険視する',function(){
    const ctx={enabled:true,phase:'FT',stackBB:30,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Qs','Js'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:88000,pot:4000,toCall:1600,facingRaise:false,position:'SB',playerName:'CL',isHuman:false,playerIdx:1,playerChipsBefore:88000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:48000,pot:92000,toCall:48000,potOdds:48000/140000,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:48000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:2,shorterStackCount:4,coverCount:4,coveredByCount:1,villainChipsBefore:88000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.finalTableProfile&&ev.finalTableProfile.stackRole==='セカンド'&&ev.finalTableProfile.collisionProfile&&ev.finalTableProfile.collisionProfile.opponent==='上位カバー'&&/セカンドがCL級/.test(ev.finalTableProfile.risk));
  });

  add('FTレンジ表: セカンドがCL級を受けるQJsはレンジ外にする',function(){
    const ctx={enabled:true,phase:'FT',stackBB:30,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Qs','Js'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:88000,pot:4000,toCall:1600,facingRaise:false,position:'SB',playerName:'CL',isHuman:false,playerIdx:1,playerChipsBefore:88000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:48000,pot:92000,toCall:48000,potOdds:48000/140000,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:48000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:2,shorterStackCount:4,coverCount:4,coveredByCount:1,villainChipsBefore:88000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.finalTableRangeProfile&&ev.finalTableRangeProfile.lane==='callOff'&&ev.finalTableRangeProfile.severity==='bad'&&/Fold 80-98%/.test(ev.strategyMix||'')&&/FTレンジ表/.test(ev.phaseWeightNote||''));
  });

  add('FTレンジ表: CLがショートを受けるAToはCL級受けと分ける',function(){
    const ctx={enabled:true,phase:'FT',stackBB:36,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Ad','Ts'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:11200,pot:4000,toCall:1600,facingRaise:false,position:'CO',playerName:'short',isHuman:false,playerIdx:1,playerChipsBefore:11200,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:11200,pot:15200,toCall:11200,potOdds:11200/26400,facingRaise:true,facingAllIn:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:57600,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covering',coverLabel:'カバーしている',coverPressure:'攻め可',stackRank:1,shorterStackCount:5,coverCount:5,coveredByCount:0,villainChipsBefore:11200})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.finalTableRangeProfile&&ev.finalTableRangeProfile.severity==='good'&&ev.finalTableRangeProfile.opponent==='ショート'&&/Call 65-90%/.test(ev.strategyMix||''));
  });

  add('FTレンジ表: 最短ショートのBTN先入れ候補を降りすぎとして示す',function(){
    const ctx={enabled:true,phase:'FT',stackBB:7,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Kc','9c'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:4000,toCall:1600,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:11200,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:0,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:6,shorterStackCount:0,coverCount:0,coveredByCount:5,shortestOppStackBB:10})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='fold');
    return !!(ev&&ev.finalTableRangeProfile&&ev.finalTableRangeProfile.severity==='good'&&ev.finalTableRangeProfile.lane==='open'&&/FTレンジ表では先入れ候補/.test(ev.phaseWeightNote||''));
  });

  add('FTポストフロップ: 上位カバー相手のリバーワンペア受けを重く見る',function(){
    const ctx={enabled:true,phase:'FT',stackBB:24,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Kd','Qd'],
      board:['Qh','9h','8s','2c','3d'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'river',action:'call',amount:9600,pot:25600,toCall:9600,potOdds:9600/35200,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:38400,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:4,shorterStackCount:2,coverCount:2,coveredByCount:2,villainChipsBefore:88000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='river'&&e.action==='call');
    return !!(ev&&ev.finalTablePostflopProfile&&ev.finalTablePostflopProfile.severity==='bad'&&ev.quality==='bad'&&(ev.deduction||0)>=22&&/FTポストフロップ補正/.test(ev.comment||''));
  });

  add('FTポストフロップ: カバーされる側の危険ボードチェックをポット管理にする',function(){
    const ctx={enabled:true,phase:'FT',stackBB:24,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Kd','Qd'],
      board:['Qh','9h','8s','2c'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'turn',action:'check',amount:0,pot:9600,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:38400,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:4,shorterStackCount:2,coverCount:2,coveredByCount:2,villainChipsBefore:88000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='turn'&&e.action==='check');
    return !!(ev&&ev.finalTablePostflopProfile&&ev.finalTablePostflopProfile.verdict==='potControl'&&ev.finalTablePostflopProfile.severity==='good'&&ev.quality!=='bad');
  });

  add('FTポストフロップ: CLがショート相手に強いSDVで受ける形を分ける',function(){
    const ctx={enabled:true,phase:'FT',stackBB:36,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Ad','Qd'],
      board:['Qh','7c','2s','4d'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'turn',action:'call',amount:5200,pot:13200,toCall:5200,potOdds:5200/18400,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:57600,coverState:'covering',coverLabel:'カバーしている',coverPressure:'攻め可',stackRank:1,shorterStackCount:5,coverCount:5,coveredByCount:0,villainChipsBefore:11200})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='turn'&&e.action==='call');
    return !!(ev&&ev.finalTablePostflopProfile&&ev.finalTablePostflopProfile.verdict==='coverValue'&&ev.finalTablePostflopProfile.severity==='good');
  });

  add('FT学習テーマ: CL級への受けすぎを一つの修正テーマにする',function(){
    const ctx={enabled:true,phase:'FT',stackBB:30,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Qs','Js'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'allin',amount:88000,pot:4000,toCall:1600,facingRaise:false,position:'SB',playerName:'CL',isHuman:false,playerIdx:1,playerChipsBefore:88000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:48000,pot:92000,toCall:48000,potOdds:48000/140000,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:48000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:2,shorterStackCount:4,coverCount:4,coveredByCount:1,villainChipsBefore:88000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    const lp=ev&&ev.finalTableLearningPoint;
    return !!(lp&&lp.category==='FT受けすぎ'&&/上位カバー/.test(lp.title)&&/受け/.test(tournamentFinalTableLearningPointText(lp)));
  });

  add('FT学習テーマ: リバーワンペア受けをFTワンペア受けに集約する',function(){
    const ctx={enabled:true,phase:'FT',stackBB:24,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Kd','Qd'],
      board:['Qh','9h','8s','2c','3d'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'river',action:'call',amount:9600,pot:25600,toCall:9600,potOdds:9600/35200,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:38400,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:4,shorterStackCount:2,coverCount:2,coveredByCount:2,villainChipsBefore:88000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='river'&&e.action==='call');
    const lp=ev&&ev.finalTableLearningPoint;
    return !!(lp&&lp.category==='FTワンペア受け'&&lp.severity==='bad');
  });

  add('FT学習テーマ: 良いポット管理チェックを肯定テーマにする',function(){
    const ctx={enabled:true,phase:'FT',stackBB:24,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Kd','Qd'],
      board:['Qh','9h','8s','2c'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'turn',action:'check',amount:0,pot:9600,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:38400,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高',stackRank:4,shorterStackCount:2,coverCount:2,coveredByCount:2,villainChipsBefore:88000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='turn'&&e.action==='check');
    const lp=ev&&ev.finalTableLearningPoint;
    return !!(lp&&lp.category==='FTポット管理'&&lp.severity==='good'&&/チェック/.test(tournamentFinalTableLearningPointText(lp)));
  });

  add('FT学習監査: レンジ外ハンドの正しいフォールドはmissing扱いしない',function(){
    const ctx={enabled:true,phase:'FT',stackBB:22,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Jc','8s'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:4000,toCall:1600,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:35200,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:0,coverState:'mixed_covered',coverLabel:'上位スタックあり',coverPressure:'高',stackRank:3,shorterStackCount:1,coverCount:3,coveredByCount:2})
      ]
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,e=>e.action==='fold');
    const issues=auditIssuesForHand(hr,an,'unit');
    return !!(ev&&ev.finalTableRangeProfile&&ev.finalTableRangeProfile.severity==='bad'&&!issues.some(function(i){return i.type==='ft-learning-missing';}));
  });

  add('FT学習テーマ: 非BBレンジ外フラットをFTフラット過多に集約する',function(){
    const ctx={enabled:true,phase:'FT',stackBB:22,players:6,playersLeft:6,seatsPaid:3,sb:800,bb:1600,bbAnte:1600,bbAnteBB:1,focusId:'ft_payjump',focusLabel:'FTペイジャンプ'};
    const hr=regressionHand({
      heroHole:['Tc','8c'],
      bigBlind:1600,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:3200,pot:4000,toCall:1600,facingRaise:false,position:'CO',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:33280,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:3200,pot:7200,toCall:3200,potOdds:3200/10400,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:35200,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'mixed_covered',coverLabel:'上位スタックあり',coverPressure:'高',stackRank:3,shorterStackCount:1,coverCount:3,coveredByCount:2,villainChipsBefore:33280})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    const lp=ev&&ev.finalTableLearningPoint;
    return !!(lp&&lp.category==='FTフラット過多'&&ev.quality==='bad'&&!/^正解/.test(ev.comment||''));
  });

  add('HU深掘り: SB/BTNリンプを混合戦略として区別する',function(){
    const ctx={enabled:true,phase:'HU',stackBB:25,players:2,playersLeft:2,seatsPaid:1,sb:1000,bb:2000,bbAnte:0,bbAnteBB:0,focusId:'hu_aggression',focusLabel:'HU攻防'};
    const hr=regressionHand({
      heroHole:['Js','8s'],
      bigBlind:2000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'call',amount:1000,pot:3000,toCall:1000,potOdds:1000/4000,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:50000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:1})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.headsUpProfile&&ev.headsUpProfile.lane==='sbLimp'&&ev.headsUpProfile.severity==='good');
  });

  add('HU深掘り: SB/BTNのプレイアブルハンド降りすぎを重く見る',function(){
    const ctx={enabled:true,phase:'HU',stackBB:25,players:2,playersLeft:2,seatsPaid:1,sb:1000,bb:2000,bbAnte:0,bbAnteBB:0,focusId:'hu_aggression',focusLabel:'HU攻防'};
    const hr=regressionHand({
      heroHole:['Qd','2c'],
      bigBlind:2000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:3000,toCall:1000,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:50000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:0})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='fold');
    return !!(ev&&ev.headsUpProfile&&ev.headsUpProfile.lane==='sbFold'&&ev.headsUpProfile.severity==='bad'&&(ev.deduction||0)>=18);
  });

  add('HU深掘り: BBのAxs押し返しを3bet圧として肯定する',function(){
    const ctx={enabled:true,phase:'HU',stackBB:25,players:2,playersLeft:2,seatsPaid:1,sb:1000,bb:2000,bbAnte:0,bbAnteBB:0,focusId:'hu_aggression',focusLabel:'HU攻防'};
    const hr=regressionHand({
      heroHole:['Ad','5d'],
      bigBlind:2000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:4000,pot:3000,toCall:1000,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:50000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'raise',amount:12000,pot:7000,toCall:2000,potOdds:2000/9000,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:50000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:3})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.isHuman&&e.position==='BB'&&e.action==='raise');
    return !!(ev&&ev.headsUpProfile&&ev.headsUpProfile.lane==='bb3bet'&&ev.headsUpProfile.severity==='good'&&ev.quality!=='bad');
  });

  add('HU深掘り: ポストフロップ小ベットを主導権維持として区別する',function(){
    const ctx={enabled:true,phase:'HU',stackBB:25,players:2,playersLeft:2,seatsPaid:1,sb:1000,bb:2000,bbAnte:0,bbAnteBB:0,focusId:'hu_aggression',focusLabel:'HU攻防'};
    const hr=regressionHand({
      heroHole:['Kd','7d'],
      board:['Qh','7s','2c'],
      bigBlind:2000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'flop',action:'raise',amount:1600,pot:5000,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:50000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='flop'&&e.action==='raise');
    return !!(ev&&ev.headsUpProfile&&ev.headsUpProfile.lane==='postflopSmallBet'&&ev.headsUpProfile.severity==='good');
  });

  add('HUリバー深掘り: 完成ボード大サイズへのワンペアコールを明確コールと言い切らない',function(){
    const ctx={enabled:true,phase:'HU',stackBB:25,players:2,playersLeft:2,seatsPaid:1,sb:1000,bb:2000,bbAnte:0,bbAnteBB:0,focusId:'hu_aggression',focusLabel:'HU攻防'};
    const hr=regressionHand({
      heroHole:['Kd','Qh'],
      board:['Ks','9s','6c','4s','2d'],
      bigBlind:2000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:8000,pot:10000,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:50000}),
        regressionDecision({street:'river',action:'call',amount:8000,pot:18000,toCall:8000,potOdds:8000/26000,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:50000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='river'&&e.action==='call');
    return !!(ev&&ev.headsUpRiverProfile&&ev.headsUpRiverProfile.verdict==='thinCatch'&&ev.headsUpRiverProfile.severity==='bad'&&ev.quality==='bad'&&!/明確なコール/.test(ev.comment||''));
  });

  add('HUリバー深掘り: 強いワンペアの小さめ薄バリューを肯定する',function(){
    const ctx={enabled:true,phase:'HU',stackBB:25,players:2,playersLeft:2,seatsPaid:1,sb:1000,bb:2000,bbAnte:0,bbAnteBB:0,focusId:'hu_aggression',focusLabel:'HU攻防'};
    const hr=regressionHand({
      heroHole:['Kd','Qh'],
      board:['Kh','8s','4d','2c','Jd'],
      bigBlind:2000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:4500,pot:10000,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:50000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='river'&&e.action==='raise');
    return !!(ev&&ev.headsUpRiverProfile&&ev.headsUpRiverProfile.verdict==='thinValue'&&ev.headsUpRiverProfile.severity==='good'&&ev.quality!=='bad');
  });

  add('HUリバー深掘り: 危険ボードのワンペアチェックをポット管理として扱う',function(){
    const ctx={enabled:true,phase:'HU',stackBB:25,players:2,playersLeft:2,seatsPaid:1,sb:1000,bb:2000,bbAnte:0,bbAnteBB:0,focusId:'hu_aggression',focusLabel:'HU攻防'};
    const hr=regressionHand({
      heroHole:['Kd','Qh'],
      board:['Ks','9s','6c','4s','2d'],
      bigBlind:2000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'river',action:'check',amount:0,pot:10000,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:50000})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.street==='river'&&e.action==='check');
    return !!(ev&&ev.headsUpRiverProfile&&ev.headsUpRiverProfile.verdict==='potControl'&&ev.headsUpRiverProfile.severity==='good'&&ev.quality!=='bad');
  });

  add('HUのBB防衛コールは専用プロファイルで広く許容する',function(){
    const ctx={enabled:true,phase:'HU',stackBB:25,players:2,playersLeft:2,seatsPaid:1,sb:1000,bb:2000,bbAnte:0,bbAnteBB:0,focusId:'hu_aggression',focusLabel:'HU攻防'};
    const hr=regressionHand({
      heroHole:['8s','7s'],
      bigBlind:2000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:4000,pot:3000,toCall:1000,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:50000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:2000,pot:7000,toCall:2000,potOdds:2000/9000,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:50000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),e=>e.action==='call');
    return !!(ev&&ev.headsUpProfile&&ev.headsUpProfile.lane==='bbDefend'&&ev.headsUpProfile.severity==='good'&&ev.quality!=='bad');
  });

  add('HU攻防生成: SB即フォールドで練習を終わらせない',function(){
    if(typeof GameEngine!=='function'||typeof aiDecide!=='function')return true;
    const ctx=applyTournamentFocus(cloneTournamentPreset('heads_up'),'hu_aggression');
    for(let i=0;i<20;i++){
      const g=new GameEngine({numPlayers:2,sb:1000,bb:2000,startingChips:50000,aiLevel:'hard',tournamentContext:ctx});
      g.startHand();
      let guard=0;
      while(g.street!=='showdown'&&!g.isHumanTurn()&&guard++<20){
        const idx=g.actionIdx;
        if(idx<0){g._check();continue;}
        const p=g.players[idx];
        if(!p||p.folded||p.allIn||!p.active){
          g.actorsRemaining=g.actorsRemaining.filter(x=>x!==idx);
          g.actionIdx=g.actorsRemaining[0]??-1;
          continue;
        }
        const d=aiDecide(p,g,'hard');
        g.processAction(idx,d.action,d.amount||0);
      }
      if(!g.isHumanTurn())return false;
    }
    return true;
  });

  add('相手の実ハンドを変えても評価が変わらない',function(){
    const oldRandom=Math.random;
    function seeded(){
      let s=1234567;
      return function(){
        s=(s*16807)%2147483647;
        return (s-1)/2147483646;
      };
    }
    function sample(villainHole){
      Math.random=seeded();
      const hr=regressionHand({
        heroHole:['Qs','Td'],
        villainHole:villainHole,
        board:['Tc','4c','9d','8c','5h'],
        decisions:[
          regressionDecision({street:'preflop',action:'call',amount:200,pot:300,toCall:200,potOdds:200/500,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:5000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:0}),
          regressionDecision({street:'preflop',action:'raise',amount:613,pot:500,toCall:200,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:5000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
          regressionDecision({street:'preflop',action:'call',amount:413,pot:1113,toCall:413,potOdds:413/1526,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:4800,playerBetBefore:200,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2}),
          regressionDecision({street:'flop',action:'check',amount:0,pot:1526,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:4387}),
          regressionDecision({street:'flop',action:'check',amount:0,pot:1526,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1}),
          regressionDecision({street:'turn',action:'raise',amount:504,pot:1526,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:4387}),
          regressionDecision({street:'turn',action:'call',amount:504,pot:2030,toCall:504,potOdds:504/2534,facingRaise:true,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1}),
          regressionDecision({street:'river',action:'check',amount:0,pot:2534,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:3883}),
          regressionDecision({street:'river',action:'raise',amount:1395,pot:2534,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1}),
          regressionDecision({street:'river',action:'call',amount:1395,pot:3929,toCall:1395,potOdds:1395/(3929+1395),facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:3883})
        ],
        pot:5324
      });
      const an=analyzeHand(hr);
      const ev=humanEval(an,function(e){return e.street==='river'&&e.action==='call';});
      return{score:an.score,quality:ev&&ev.quality,deduction:ev&&ev.deduction,rawEqPct:ev&&ev.rawEqPct,effectiveEqPct:ev&&ev.effectiveEqPct};
    }
    try{
      const a=sample(['Ah','Ac']);
      const b=sample(['2d','7h']);
      return JSON.stringify(a)===JSON.stringify(b);
    }finally{
      Math.random=oldRandom;
    }
  });

  add('実ハンド混入監査をPASSとして評価結果に保持する',function(){
    const hr=regressionHand({
      heroHole:['Qs','Td'],
      villainHole:['Ah','Ac'],
      board:['Tc','4c','9d','8c','5h'],
      decisions:[
        regressionDecision({street:'flop',action:'check',amount:0,pot:1526,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:4387}),
        regressionDecision({street:'turn',action:'raise',amount:504,pot:1526,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:4387}),
        regressionDecision({street:'river',action:'call',amount:1395,pot:3929,toCall:1395,potOdds:1395/(3929+1395),facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:3883})
      ],
      pot:5324
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='river'&&e.action==='call';});
    return !!(an.actualHandAudit&&an.actualHandAudit.status==='PASS'&&an.actualHandAudit.hiddenCardCount===2&&an.actualHandAudit.evalInvariant&&ev&&ev.equitySource&&/実ハンド不使用/.test(ev.hiddenInfoPolicy||''));
  });

  add('ハンド履歴コピーに実ハンド監査を出し非公開相手カードを漏らさない',function(){
    const oldHR=window._lastHR,oldAN=window._lastAN;
    const hr=regressionHand({
      heroHole:['Qs','Td'],
      villainHole:['Ah','Ac'],
      board:['Tc','4c','9d','8c','5h'],
      decisions:[
        regressionDecision({street:'river',action:'call',amount:1395,pot:3929,toCall:1395,potOdds:1395/(3929+1395),facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:3883})
      ],
      winners:[{player:null,playerIdx:0,amount:5324,byFold:true}],
      pot:5324
    });
    hr.winners[0].player=hr.players[0];
    try{
      window._lastHR=hr;window._lastAN=analyzeHand(hr);
      const txt=buildHandHistoryText(false);
      return /実ハンド混入監査: PASS/.test(txt)&&/相手ハンド: 非公開/.test(txt)&&!/Ah|Ac/.test(txt)&&/EQ基準=/.test(txt);
    }finally{
      window._lastHR=oldHR;window._lastAN=oldAN;
    }
  });

  add('評価JSONに実ハンド監査を保持し非公開相手カードを含めない',function(){
    const hr=regressionHand({
      heroHole:['Qs','Td'],
      villainHole:['Ah','Ac'],
      board:['Tc','4c','9d','8c','5h'],
      decisions:[
        regressionDecision({street:'river',action:'call',amount:1395,pot:3929,toCall:1395,potOdds:1395/(3929+1395),facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:3883})
      ],
      pot:5324
    });
    const an=analyzeHand(hr);
    const snap=evaluationSnapshot(hr,an);
    const js=JSON.stringify(snap);
    return !!(snap&&snap.actualHandAudit&&snap.actualHandAudit.status==='PASS'&&snap.evaluations[0].equitySource&&!/(^|[^A-Za-z0-9])(Ah|Ac)(?=[^A-Za-z0-9]|$)/.test(js));
  });

  add('プリフロップ文脈ラベルでBBディフェンスを区別する',function(){
    const hr=regressionHand({
      heroHole:['Jc','9c'],
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:5,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:22,toCall:10,potOdds:10/32,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='preflop'&&e.action==='call';});
    return !!(ev&&ev.lineContext==='BBディフェンス'&&ev.evalAxis==='BBディフェンス'&&ev.axisTags&&ev.axisTags.includes('レンジ')&&!/コールドコール/.test(ev.lineContext));
  });

  add('トーナメント極小スタック開始を補正する',function(){
    const ctx={enabled:true,phase:'中盤',stackBB:20,players:8,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'bb_defend',focusLabel:'BBディフェンス練習'};
    const g=new GameEngine({sb:500,bb:1000,aiLevel:'medium',startingChips:20000,numPlayers:8,tournamentContext:ctx});
    g.players[0].chips=20;
    g._ensurePlayableTournamentStacks();
    return g.players[0].chips>=6000&&g.players[0].allIn===false;
  });

  add('フロップ練習の不自然なプリフロップ前提を別枠で検出する',function(){
    const hr=regressionHand({
      heroHole:['Jh','Tc'],
      villainHole:['Qs','Jc'],
      pfStory:{narrative:'UTG open -> MP call'},
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:13,pot:7,toCall:5,facingRaise:false,position:'UTG',playerName:'yohe',isHuman:false,playerIdx:1,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:13,pot:20,toCall:13,potOdds:13/(20+13),facingRaise:true,position:'MP',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const audit=analyzeHand(hr).premiseAudit;
    return !!(audit&&audit.issues.length>=1&&/出題前提/.test(audit.issues[0].text));
  });

  add('シナリオ品質監査: 低SPRのフロップ出題を不成立にする',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Kc'],
      board:['Ts','9s','4d'],
      heroChips:180,
      villainChips:2000,
      pot:1000,
      street:'flop',
      pfStory:{participants:[0,1],narrative:'CO open -> BTN call | ポット 1000T'}
    });
    const audit=trainingSpotQualityAudit(hr,{mode:'scenario'});
    return !!(audit&&!audit.ok&&/SPR/.test(trainingSpotQualityText(audit)));
  });

  add('シナリオ品質監査: 健全なHUフロップ出題を成立扱いにする',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Qh'],
      board:['Ts','9s','4d'],
      heroChips:4200,
      villainChips:4200,
      pot:1000,
      street:'flop',
      pfStory:{participants:[0,1],narrative:'CO open -> BTN call | ポット 1000T'}
    });
    const audit=trainingSpotQualityAudit(hr,{mode:'scenario'});
    return !!(audit&&audit.ok&&audit.spr>=4&&audit.livePlayers===2);
  });

  add('フロップトレーニング生成は品質監査を通る前提を作る',function(){
    const oldRandom=Math.random;
    let s=24681357;
    Math.random=function(){s=(s*48271)%2147483647;return (s-1)/2147483646;};
    try{
      const g=new GameEngine({sb:2,bb:5,aiLevel:'medium',startingChips:500,numPlayers:6});
      g.startHand();
      g.players.forEach(function(p){
        (p.holeCards||[]).forEach(function(c){g.deck.cards.push(c);});
        p.holeCards=[];
        p.chips+=p.totalInvested;
        p.totalInvested=0;p.currentBet=0;
      });
      g.pot=0;g.deck.shuffle();
      const baseChips=g.players.map(function(p){return p.chips;});
      let audit=null;
      for(let attempt=0;attempt<8;attempt++){
        _resetScenarioAttemptState(g,baseChips);
        const sc=_genScenarioFlop(g.deck.cards,_pickScenarioCat());
        g._scenario=sc;
        _buildAndApplyPreflopStory(g);
        g.street='flop';g.community=sc.flopCards;
        g.currentBet=0;g.players.forEach(function(p){p.currentBet=0;});
        g._setOrder();
        audit=trainingSpotQualityAudit(g,{mode:'scenario'});
        if(audit.ok)break;
      }
      return !!(audit&&audit.ok&&g._pfStory&&g._pfStory.participants&&g._pfStory.participants.length>=2&&g.actionIdx>=0);
    }finally{
      Math.random=oldRandom;
    }
  });

  add('ペアボードのAハイフラッシュを全体ナッツ扱いしない',function(){
    const role=handRole(regressionCards(['Ad','8d']),regressionCards(['4d','Qd','6c','9h','6d']),HandEval.evaluate(regressionCards(['Ad','8d','4d','Qd','6c','9h','6d'])));
    return !!(role&&role.isNut===false&&role.isVuln===true&&role.nutFlush===true&&role.riskFlags&&role.riskFlags.strongerFullHouseQuads===true);
  });

  add('ストレートで不可能なフラッシュ警告を出さない',function(){
    const role=handRole(regressionCards(['Ts','Jh']),regressionCards(['7c','8d','9s','2h','2c']),HandEval.evaluate(regressionCards(['Ts','Jh','7c','8d','9s','2h','2c'])));
    return !!(role&&role.role==='strong'&&role.riskFlags&&role.riskFlags.flushPossible===false&&role.riskFlags.strongerFullHouseQuads===true);
  });

  add('相手が全員オールインなら次ストリートでチェックを出さず自動ランアウトする',function(){
    const g=new GameEngine({sb:2,bb:5,aiLevel:'medium',startingChips:500,numPlayers:3});
    g.players[0].holeCards=regressionCards(['Kc','Ac']);
    g.players[1].holeCards=regressionCards(['Qs','Qd']);
    g.players[2].holeCards=regressionCards(['Jh','Jd']);
    g.players[0].chips=300;g.players[0].allIn=false;g.players[0].folded=false;
    g.players[1].chips=0;g.players[1].allIn=true;g.players[1].folded=false;
    g.players[2].chips=0;g.players[2].allIn=true;g.players[2].folded=false;
    g.community=regressionCards(['Qh','Ad','Tc']);
    g.pot=1442;g.currentBet=0;g.minRaise=5;g.street='flop';g.dealerIndex=0;g.sbIdx=1;g.bbIdx=2;
    g.actorsRemaining=[];g.actionIdx=-1;
    g._next();
    return g.street==='showdown'&&g.community.length===5&&g.actionIdx===-1;
  });

  function limpIsoTopPairHand(){
    const players=[
      regressionPlayer('あなた',true,['Ts','Qd'],{chips:5000}),
      regressionPlayer('m',false,['Qh','Th'],{chips:5000}),
      regressionPlayer('yohe',false,['Kd','7c'],{folded:true}),
      regressionPlayer('kan',false,['7d','As'],{folded:true}),
      regressionPlayer('bun',false,['6h','Kc'],{folded:true}),
      regressionPlayer('dai',false,['8s','Kh'],{folded:true}),
      regressionPlayer('jiro',false,['Ad','3c'],{folded:true}),
      regressionPlayer('world',false,['Jd','7h'],{folded:true})
    ];
    return regressionHand({
      players:players,
      board:['Tc','4c','9d','8c','5h'],
      bigBlind:200,
      pot:5324,
      decisions:[
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:300,toCall:200,position:'UTG',playerName:'bun',isHuman:false,playerIdx:4}),
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:300,toCall:200,position:'UTG+1',playerName:'dai',isHuman:false,playerIdx:5}),
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:300,toCall:200,position:'MP',playerName:'jiro',isHuman:false,playerIdx:6}),
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:300,toCall:200,position:'HJ',playerName:'world',isHuman:false,playerIdx:7}),
        regressionDecision({street:'preflop',action:'call',amount:200,pot:300,toCall:200,potOdds:200/500,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:5000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:0}),
        regressionDecision({street:'preflop',action:'raise',amount:613,pot:500,toCall:200,facingRaise:false,position:'BTN',playerName:'m',isHuman:false,playerIdx:1,playerChipsBefore:5000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:1113,toCall:513,position:'SB',playerName:'yohe',isHuman:false,playerIdx:2}),
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:1113,toCall:413,position:'BB',playerName:'kan',isHuman:false,playerIdx:3}),
        regressionDecision({street:'preflop',action:'call',amount:413,pot:1113,toCall:413,potOdds:413/1526,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:4800,playerBetBefore:200,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:1526,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:4387}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:1526,toCall:0,facingRaise:false,position:'BTN',playerName:'m',isHuman:false,playerIdx:1}),
        regressionDecision({street:'turn',action:'raise',amount:504,pot:1526,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:4387}),
        regressionDecision({street:'turn',action:'call',amount:504,pot:2030,toCall:504,potOdds:504/2534,facingRaise:true,position:'BTN',playerName:'m',isHuman:false,playerIdx:1}),
        regressionDecision({street:'river',action:'check',amount:0,pot:2534,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:3883}),
        regressionDecision({street:'river',action:'raise',amount:1395,pot:2534,toCall:0,facingRaise:false,position:'BTN',playerName:'m',isHuman:false,playerIdx:1}),
        regressionDecision({street:'river',action:'call',amount:1395,pot:3929,toCall:1395,potOdds:1395/(3929+1395),facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:3883})
      ]
    });
  }

  function multiwayAirBetHand(){
    const players=[
      regressionPlayer('あなた',true,['9s','8d'],{chips:500}),
      regressionPlayer('btn',false,['Kc','Qc'],{chips:500}),
      regressionPlayer('bb',false,['7h','7d'],{chips:500})
    ];
    return regressionHand({
      players:players,
      board:['As','Kd','4c'],
      bigBlind:5,
      pot:210,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:5,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:15,pot:22,toCall:15,potOdds:15/37,facingRaise:true,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:37,toCall:10,potOdds:10/47,facingRaise:true,position:'BB',playerName:'bb',isHuman:false,playerIdx:2,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'raise',amount:40,pot:47,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:485})
      ]
    });
  }

  function multiwayTopPairCheckHand(){
    const players=[
      regressionPlayer('あなた',true,['As','Td'],{chips:500}),
      regressionPlayer('btn',false,['Kh','Qh'],{chips:500}),
      regressionPlayer('bb',false,['Jc','9c'],{chips:500})
    ];
    return regressionHand({
      players:players,
      board:['Ts','9s','4d'],
      bigBlind:5,
      pot:80,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:5,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:15,pot:22,toCall:15,potOdds:15/37,facingRaise:true,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:37,toCall:10,potOdds:10/47,facingRaise:true,position:'BB',playerName:'bb',isHuman:false,playerIdx:2,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:47,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:485})
      ]
    });
  }

  function multiwayTopPairCallHand(){
    const players=[
      regressionPlayer('あなた',true,['Ah','Td'],{chips:2500}),
      regressionPlayer('btn',false,['Kh','Qh'],{chips:2500}),
      regressionPlayer('bb',false,['Jc','9c'],{chips:2500})
    ];
    return regressionHand({
      players:players,
      board:['Ts','9s','4d','8s'],
      bigBlind:5,
      pot:240,
      decisions:[
        regressionDecision({street:'turn',action:'raise',amount:110,pot:180,toCall:0,facingRaise:false,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:2500}),
        regressionDecision({street:'turn',action:'call',amount:110,pot:290,toCall:110,potOdds:110/400,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:2500})
      ]
    });
  }

  function multiwayStrongValueHand(){
    const players=[
      regressionPlayer('あなた',true,['Ts','Td'],{chips:500}),
      regressionPlayer('btn',false,['Kh','Qh'],{chips:500}),
      regressionPlayer('bb',false,['Jc','9c'],{chips:500})
    ];
    return regressionHand({
      players:players,
      board:['Th','9s','4d'],
      bigBlind:5,
      pot:80,
      decisions:[
        regressionDecision({street:'flop',action:'raise',amount:35,pot:80,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ]
    });
  }

  function deepSprTopPairCallHand(){
    const players=[
      regressionPlayer('あなた',true,['As','Td'],{chips:12000}),
      regressionPlayer('btn',false,['Kh','Qh'],{chips:12000})
    ];
    return regressionHand({
      players:players,
      board:['Ts','9s','4d','8c','5h'],
      bigBlind:100,
      pot:2400,
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:700,pot:1000,toCall:0,facingRaise:false,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:12000}),
        regressionDecision({street:'river',action:'call',amount:700,pot:1700,toCall:700,potOdds:700/2400,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:12000})
      ]
    });
  }

  function deepSprTopPairCheckHand(){
    const players=[
      regressionPlayer('あなた',true,['As','Td'],{chips:12000}),
      regressionPlayer('btn',false,['Kh','Qh'],{chips:12000})
    ];
    return regressionHand({
      players:players,
      board:['Ts','9s','4d'],
      bigBlind:100,
      pot:1000,
      decisions:[
        regressionDecision({street:'flop',action:'check',amount:0,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:12000})
      ]
    });
  }

  function initiativeOopCheckHand(){
    const players=[
      regressionPlayer('あなた',true,['Qs','Td'],{chips:500}),
      regressionPlayer('btn',false,['Ah','Kd'],{chips:500})
    ];
    return regressionHand({
      players:players,
      board:['Ts','9s','4d'],
      bigBlind:5,
      pot:75,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:5,facingRaise:false,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:22,toCall:10,potOdds:10/32,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:32,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:490})
      ]
    });
  }

  function initiativeOopDonkHand(){
    const players=[
      regressionPlayer('あなた',true,['7s','6d'],{chips:500}),
      regressionPlayer('btn',false,['Ah','Kd'],{chips:500})
    ];
    return regressionHand({
      players:players,
      board:['As','Kd','4c'],
      bigBlind:5,
      pot:75,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:5,facingRaise:false,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:22,toCall:10,potOdds:10/32,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2}),
        regressionDecision({street:'flop',action:'raise',amount:22,pot:32,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:490})
      ]
    });
  }

  function initiativePfrCbetHand(){
    const players=[
      regressionPlayer('あなた',true,['Ah','Qd'],{chips:500}),
      regressionPlayer('bb',false,['9c','8c'],{chips:500})
    ];
    return regressionHand({
      players:players,
      board:['Ad','7s','2c'],
      bigBlind:5,
      pot:75,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:5,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:22,toCall:10,potOdds:10/32,facingRaise:true,position:'BB',playerName:'bb',isHuman:false,playerIdx:1,playerChipsBefore:500,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2}),
        regressionDecision({street:'flop',action:'raise',amount:10,pot:32,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:485})
      ]
    });
  }

  function threeBetAggressorCbetHand(){
    const players=[
      regressionPlayer('あなた',true,['Ah','Qd'],{chips:500}),
      regressionPlayer('co',false,['9c','8c'],{chips:500})
    ];
    return regressionHand({
      players:players,
      board:['Ad','7s','2c'],
      bigBlind:5,
      pot:110,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:5,facingRaise:false,position:'CO',playerName:'co',isHuman:false,playerIdx:1,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'raise',amount:50,pot:22,toCall:15,potOdds:15/37,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:3}),
        regressionDecision({street:'preflop',action:'call',amount:35,pot:72,toCall:35,potOdds:35/107,facingRaise:true,position:'CO',playerName:'co',isHuman:false,playerIdx:1,playerChipsBefore:485,pfRaiseCountBefore:2,pfFacingBetLevel:3,pfActionBetLevel:3}),
        regressionDecision({street:'flop',action:'raise',amount:35,pot:107,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:450})
      ]
    });
  }

  function ringRiverOnePairBigCallHand(){
    const players=[
      regressionPlayer('あなた',true,['Qd','Ts'],{chips:900}),
      regressionPlayer('btn',false,['Ac','Kd'],{chips:900})
    ];
    return regressionHand({
      players:players,
      board:['Tc','9c','8c','5c','2h'],
      bigBlind:5,
      pot:617,
      decisions:[
        regressionDecision({street:'flop',action:'raise',amount:45,pot:90,toCall:0,facingRaise:false,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'flop',action:'call',amount:45,pot:135,toCall:45,potOdds:45/180,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900}),
        regressionDecision({street:'turn',action:'raise',amount:75,pot:180,toCall:0,facingRaise:false,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:855}),
        regressionDecision({street:'turn',action:'call',amount:75,pot:255,toCall:75,potOdds:75/330,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:855}),
        regressionDecision({street:'river',action:'raise',amount:190,pot:330,toCall:0,facingRaise:false,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:780}),
        regressionDecision({street:'river',action:'call',amount:190,pot:520,toCall:190,potOdds:190/710,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:780})
      ]
    });
  }

  function ringRiverThinValueSmallHand(){
    const players=[
      regressionPlayer('あなた',true,['Ah','Td'],{chips:900}),
      regressionPlayer('bb',false,['9d','8d'],{chips:900})
    ];
    return regressionHand({
      players:players,
      board:['Ts','9s','4d','3c','2h'],
      bigBlind:5,
      pot:1300,
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:300,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900})
      ]
    });
  }

  function ringRiverBadBluffHand(){
    const players=[
      regressionPlayer('あなた',true,['Ah','Jh'],{chips:900}),
      regressionPlayer('bb',false,['9d','9c'],{chips:900})
    ];
    return regressionHand({
      players:players,
      board:['Kh','Qh','7s','3c','2d'],
      bigBlind:5,
      pot:1900,
      decisions:[
        regressionDecision({street:'flop',action:'raise',amount:160,pot:300,toCall:0,facingRaise:false,position:'BB',playerName:'bb',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'flop',action:'call',amount:160,pot:460,toCall:160,potOdds:160/620,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'raise',amount:900,pot:1000,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:740})
      ]
    });
  }

  function ringRiverPotControlCheckHand(){
    const players=[
      regressionPlayer('あなた',true,['Ah','Td'],{chips:900}),
      regressionPlayer('bb',false,['9d','8d'],{chips:900})
    ];
    return regressionHand({
      players:players,
      board:['Ts','9s','4d','3c','2h'],
      bigBlind:5,
      pot:1000,
      decisions:[
        regressionDecision({street:'river',action:'check',amount:0,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900})
      ]
    });
  }

  add('リング文脈: COオープンリンプを専用プロフィールで拾う',function(){
    const ev=humanEval(analyzeHand(limpIsoTopPairHand()),function(e){return e.street==='preflop'&&e.action==='call'&&!e.facingRaise;});
    return !!(ev&&ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane==='openLimp'&&ev.liveCashSpotProfile.severity==='bad'&&/オープンリンプ/.test(ev.coachComment||coachReviewText(ev)));
  });

  add('リング文脈: リンプ後アイソへのOOPコールを別場面として扱う',function(){
    const ev=humanEval(analyzeHand(limpIsoTopPairHand()),function(e){return e.street==='preflop'&&e.action==='call'&&e.facingRaise;});
    return !!(ev&&ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane==='limpIsoCall'&&ev.evalAxis==='リング参加レンジ'&&/リンプ→アイソ/.test(liveCashSpotProfileText(ev.liveCashSpotProfile)));
  });

  add('リング文脈: UTGのK2oフォールドをミックスやOpen候補扱いしない',function(){
    const players=[
      regressionPlayer('あなた',true,['2c','Kd'],{chips:500}),
      regressionPlayer('mp',false,['Ah','Qh'],{chips:500}),
      regressionPlayer('co',false,['9s','9d'],{chips:500}),
      regressionPlayer('btn',false,['8c','7c'],{chips:500}),
      regressionPlayer('sb',false,['As','5s'],{chips:500}),
      regressionPlayer('bb',false,['Jh','Td'],{chips:500})
    ];
    const hr=regressionHand({
      players:players,
      bigBlind:5,
      decisions:[
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:7,toCall:5,facingRaise:false,position:'UTG',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'preflop',action:'raise',amount:10,pot:7,toCall:5,facingRaise:false,position:'SB',playerName:'sb',isHuman:false,playerIdx:4,playerChipsBefore:498}),
        regressionDecision({street:'preflop',action:'fold',amount:0,pot:17,toCall:5,facingRaise:true,position:'BB',playerName:'bb',isHuman:false,playerIdx:5,playerChipsBefore:495})
      ],
      pot:17
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='preflop'&&e.action==='fold';});
    const coach=coachReviewText(ev);
    return !!(ev&&ev.quality==='good'&&ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane==='openFold'&&ev.liveCashSpotProfile.severity==='good'&&!an.primaryLesson&&!/ミックス寄り|Openです|オープン推奨/.test(coach+(ev.comment||'')));
  });

  add('リングスキル: リングゲームに分野別スコアを出す',function(){
    const an=analyzeHand(limpIsoTopPairHand());
    const labels=(an.liveCashScores||[]).map(function(s){return s.label;});
    return !!(labels.includes('参加レンジ')&&labels.includes('主導権')&&labels.includes('リバー判断')&&labels.includes('バリュー/サイズ')&&!an.tournamentScores);
  });

  add('リングスキル: ハンド履歴コピーに要約を含める',function(){
    const oldHR=window._lastHR,oldAN=window._lastAN;
    try{
      window._lastHR=limpIsoTopPairHand();
      window._lastAN=analyzeHand(window._lastHR);
      const txt=buildHandHistoryText(false);
      return /リングスキル:/.test(txt)&&/参加レンジ/.test(txt)&&/リバー判断/.test(txt);
    }finally{
      window._lastHR=oldHR;window._lastAN=oldAN;
    }
  });

  add('リングスキル: 評価JSONにliveCashScoresを保持する',function(){
    const hr=limpIsoTopPairHand();
    const an=analyzeHand(hr);
    const snap=evaluationSnapshot(hr,an);
    return !!(snap&&snap.liveCashScores&&snap.liveCashScores.some(function(s){return s.label==='参加レンジ';})&&!snap.tournamentScores);
  });

  add('リングSPR: 深いSPRでワンペア大きいコールを主題化する',function(){
    const an=analyzeHand(deepSprTopPairCallHand());
    const ev=humanEval(an,function(e){return e.street==='river'&&e.action==='call';});
    const labels=(an.liveCashScores||[]).map(function(s){return s.label;});
    return !!(ev&&ev.liveCashSprProfile&&ev.liveCashSprProfile.lane==='deepSprOnePairCall'&&labels.includes('有効スタック/SPR')&&(ev.evalAxis==='リバーのコール/フォールド'||ev.evalAxis==='有効スタック/SPR'||ev.evalAxis==='リバーの金額判断'));
  });

  add('リングSPR: 深いSPRのチェックをポット管理として肯定する',function(){
    const an=analyzeHand(deepSprTopPairCheckHand());
    const ev=humanEval(an,function(e){return e.street==='flop'&&e.action==='check';});
    return !!(ev&&ev.liveCashSprProfile&&ev.liveCashSprProfile.lane==='deepSprPotControl'&&ev.quality!=='bad'&&(ev.deduction||0)<=5);
  });

  add('リングSPR: 評価JSONにliveCashSprProfileを保持する',function(){
    const hr=deepSprTopPairCallHand();
    const an=analyzeHand(hr);
    const snap=evaluationSnapshot(hr,an);
    return !!(snap&&snap.evaluations&&snap.evaluations.some(function(e){return e.liveCashSprProfile&&e.liveCashSprProfile.lane==='deepSprOnePairCall';}));
  });

  add('リング主導権: 主導権なしOOPチェックを自然な受けにする',function(){
    const an=analyzeHand(initiativeOopCheckHand());
    const ev=humanEval(an,function(e){return e.street==='flop'&&e.action==='check';});
    const labels=(an.liveCashScores||[]).map(function(s){return s.label;});
    return !!(ev&&ev.liveCashInitiativeProfile&&ev.liveCashInitiativeProfile.lane==='oopNoInitiativeCheck'&&ev.quality!=='bad'&&(ev.deduction||0)<=5&&labels.includes('主導権'));
  });

  add('リング主導権: 主導権なしOOPドンクを専用ミスにする',function(){
    const an=analyzeHand(initiativeOopDonkHand());
    const ev=humanEval(an,function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    return !!(ev&&ev.liveCashInitiativeProfile&&ev.liveCashInitiativeProfile.lane==='oopNoInitiativeDonk'&&ev.liveCashInitiativeProfile.severity==='bad'&&ev.evalAxis==='チェック頻度と主導権'&&(ev.deduction||0)>=12);
  });

  add('リング主導権: PFR側の自然なCBを主導権文脈で保持する',function(){
    const an=analyzeHand(initiativePfrCbetHand());
    const ev=humanEval(an,function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    return !!(ev&&ev.liveCashInitiativeProfile&&ev.liveCashInitiativeProfile.lane==='pfrCbet'&&ev.liveCashInitiativeProfile.severity==='good'&&ev.quality!=='bad');
  });

  add('リング主導権: pfStoryだけのOOP PFR CBをドンク扱いしない',function(){
    const hr=regressionHand({
      heroHole:['Ks','Ac'],
      villainHole:['Td','Ts'],
      board:['Ad','6c','7h','2c','Kd'],
      pfStory:{participants:[0,1],narrative:'MP(あなた) 18T オープン → BTN(take) 18T コール | ポット 43T'},
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:14,pot:43,toCall:0,facingRaise:false,position:'MP',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:14,pot:57,toCall:14,facingRaise:true,position:'BTN',playerName:'take',isHuman:false,playerIdx:1,playerChipsBefore:500})
      ],
      pot:57
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const txt=(ev&&ev.coachComment)||coachReviewText(ev);
    return !!(ev&&ev.liveCashInitiativeProfile&&ev.liveCashInitiativeProfile.lane==='pfrCbet'&&ev.liveCashInitiativeProfile.severity==='good'&&ev.quality!=='bad'&&!/ドンク|OOPリード|主導権がない/.test(txt));
  });

  add('リング主導権: 評価JSONにliveCashInitiativeProfileを保持する',function(){
    const hr=initiativeOopDonkHand();
    const an=analyzeHand(hr);
    const snap=evaluationSnapshot(hr,an);
    return !!(snap&&snap.evaluations&&snap.evaluations.some(function(e){return e.liveCashInitiativeProfile&&e.liveCashInitiativeProfile.lane==='oopNoInitiativeDonk';}));
  });

  add('リング3BET: 4BET対応コールを専用プロフィールで重く見る',function(){
    const hr=regressionHand({
      heroHole:['7s','7h'],
      decisions:fourBetBaseDecisions(regressionDecision({street:'preflop',action:'call',amount:205,pot:317,toCall:205,potOdds:205/(317+205),facingRaise:true,position:'SB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:455,playerBetBefore:45,pfRaiseCountBefore:3,pfHumanRaisedBefore:true,pfFacingBetLevel:4,pfActionBetLevel:4}))
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='preflop'&&e.action==='call';});
    return !!(ev&&ev.liveCashReraisedPotProfile&&ev.liveCashReraisedPotProfile.lane==='fourBetResponse'&&ev.liveCashReraisedPotProfile.severity==='bad'&&ev.evalAxis==='3BET/4BETポット'&&(ev.deduction||0)>=18);
  });

  add('リング3BET: OOP受け側のチェックを自然な受けにする',function(){
    const an=analyzeHand(threeBetUnderpairHand());
    const ev=humanEval(an,function(e){return e.street==='flop'&&e.action==='check';});
    const labels=(an.liveCashScores||[]).map(function(s){return s.label;});
    return !!(ev&&ev.liveCashReraisedPotProfile&&ev.liveCashReraisedPotProfile.lane==='threeBetCallerOop'&&ev.liveCashReraisedPotProfile.severity==='good'&&ev.quality!=='bad'&&labels.includes('3BETポット'));
  });

  add('リング3BET: 3BET側の小さめCBを自然な継続にする',function(){
    const an=analyzeHand(threeBetAggressorCbetHand());
    const ev=humanEval(an,function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    return !!(ev&&ev.liveCashReraisedPotProfile&&ev.liveCashReraisedPotProfile.lane==='threeBetAggressor'&&ev.liveCashReraisedPotProfile.severity==='good'&&ev.quality!=='bad');
  });

  add('リング3BET: 評価JSONにliveCashReraisedPotProfileを保持する',function(){
    const hr=threeBetAggressorCbetHand();
    const an=analyzeHand(hr);
    const snap=evaluationSnapshot(hr,an);
    return !!(snap&&snap.evaluations&&snap.evaluations.some(function(e){return e.liveCashReraisedPotProfile&&e.liveCashReraisedPotProfile.lane==='threeBetAggressor';}));
  });

  add('主テーマ: 複数軸から一つの学習テーマを選ぶ',function(){
    const an=analyzeHand(limpIsoTopPairHand());
    return !!(an.primaryLesson&&an.primaryLesson.title&&an.primaryLesson.supportingAxes&&an.primaryLesson.supportingAxes.length>=1&&/プリフロップ|リバー|ワンペア/.test(an.primaryLesson.title));
  });

  add('主テーマ: 3BETポットOOPを主題候補にできる',function(){
    const an=analyzeHand(threeBetUnderpairHand());
    return !!(an.primaryLesson&&(an.primaryLesson.category==='threebet-pot-realization'||an.primaryLesson.category==='ring-reraised-pot')&&/3BET/.test(an.primaryLesson.title));
  });

  add('主テーマ: ハンド履歴コピーと評価JSONに保持する',function(){
    const oldHR=window._lastHR,oldAN=window._lastAN;
    try{
      window._lastHR=limpIsoTopPairHand();
      window._lastAN=analyzeHand(window._lastHR);
      const txt=buildHandHistoryText(false);
      const snap=evaluationSnapshot(window._lastHR,window._lastAN);
      return /主テーマ:/.test(txt)&&!!(snap&&snap.primaryLesson&&snap.primaryLesson.title);
    }finally{
      window._lastHR=oldHR;window._lastAN=oldAN;
    }
  });

  add('主テーマ: バブルICMをトーナメント主題として優先する',function(){
    const ctx={enabled:true,phase:'バブル',stackBB:14,players:9,playersLeft:7,seatsPaid:3,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'bubble_call',focusLabel:'バブル薄コール回避'};
    const hr=regressionHand({
      heroHole:['Qs','To'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:2000,pot:2500,toCall:1000,facingRaise:false,position:'HJ',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:26000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:2000,pot:4500,toCall:2000,potOdds:2000/6500,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:14000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2,coverState:'covered',coverLabel:'カバーされている',coverPressure:'高'})
      ]
    });
    const an=analyzeHand(hr);
    return !!(an.primaryLesson&&/^bubble-/.test(an.primaryLesson.category)&&/バブル/.test(an.primaryLesson.modeLabel||''));
  });

  add('主テーマ: 中盤の非BB flatを中盤スタック計画に集約する',function(){
    const ctx={enabled:true,phase:'中盤',stackBB:20,players:8,playersLeft:14,seatsPaid:3,sb:500,bb:1000,bbAnte:1000,bbAnteBB:1,focusId:'reshove20',focusLabel:'20BB reshove練習'};
    const hr=regressionHand({
      heroHole:['Qs','To'],
      bigBlind:1000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:2200,pot:2500,toCall:1000,facingRaise:false,position:'HJ',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:24000,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:2200,pot:4700,toCall:2200,potOdds:2200/6900,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:20000,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ]
    });
    const an=analyzeHand(hr);
    return !!(an.primaryLesson&&an.primaryLesson.category==='middle-stack-plan'&&/中盤/.test(an.primaryLesson.modeLabel||''));
  });

  add('主テーマ: HUリバーをHU文体の主題にする',function(){
    const ctx={enabled:true,phase:'HU',stackBB:25,players:2,playersLeft:2,seatsPaid:1,sb:1000,bb:2000,bbAnte:0,bbAnteBB:0,focusId:'hu_aggression',focusLabel:'HU攻防'};
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Qh'],
      board:['Ts','9s','8c','5c','2h'],
      bigBlind:2000,
      tournamentContext:ctx,
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:9000,pot:10000,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:50000}),
        regressionDecision({street:'river',action:'call',amount:9000,pot:19000,toCall:9000,potOdds:9000/28000,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:50000})
      ]
    });
    const an=analyzeHand(hr);
    return !!(an.primaryLesson&&an.primaryLesson.category==='heads-up-river'&&/HU/.test(an.primaryLesson.modeLabel||''));
  });

  add('リング評価軸: 3BETポットを独立スキルに分ける',function(){
    const an=analyzeHand(threeBetUnderpairHand());
    const ev=humanEval(an,function(e){return e.street==='flop'&&e.action==='call';});
    const labels=(an.liveCashScores||[]).map(function(s){return s.label;});
    return !!(ev&&ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane==='threeBetPotOop'&&ev.evalAxis==='3BETポット'&&labels.includes('3BETポット'));
  });

  add('リング評価軸: マルチウェイをサイズ評価から分離する',function(){
    const an=analyzeHand(multiwayAirBetHand());
    const ev=humanEval(an,function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const labels=(an.liveCashScores||[]).map(function(s){return s.label;});
    return !!(ev&&ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane==='multiwayPressure'&&ev.evalAxis==='マルチウェイ'&&labels.includes('マルチウェイ'));
  });

  add('リングMW: マルチウェイのトップペアチェックを自然なポット管理にする',function(){
    const an=analyzeHand(multiwayTopPairCheckHand());
    const ev=humanEval(an,function(e){return e.street==='flop'&&e.action==='check';});
    return !!(ev&&ev.liveCashMultiwayProfile&&ev.liveCashMultiwayProfile.lane==='multiwayCheckControl'&&ev.liveCashMultiwayProfile.severity==='good'&&ev.quality!=='bad'&&(ev.deduction||0)<=4);
  });

  add('リングMW: 完成寄りボードのワンペア大きめコールを受けすぎにする',function(){
    const an=analyzeHand(multiwayTopPairCallHand());
    const ev=humanEval(an,function(e){return e.street==='turn'&&e.action==='call';});
    return !!(ev&&ev.liveCashMultiwayProfile&&ev.liveCashMultiwayProfile.lane==='multiwayOnePairCall'&&ev.liveCashMultiwayProfile.severity==='bad'&&ev.evalAxis==='マルチウェイ'&&(ev.deduction||0)>=16);
  });

  add('リングMW: 強い完成役のマルチウェイバリューは肯定する',function(){
    const an=analyzeHand(multiwayStrongValueHand());
    const ev=humanEval(an,function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    return !!(ev&&ev.liveCashMultiwayProfile&&ev.liveCashMultiwayProfile.lane==='multiwayValueProtection'&&ev.liveCashMultiwayProfile.severity==='good'&&ev.quality!=='bad');
  });

  add('リングMW: 評価JSONにliveCashMultiwayProfileを保持する',function(){
    const hr=multiwayTopPairCallHand();
    const an=analyzeHand(hr);
    const snap=evaluationSnapshot(hr,an);
    return !!(snap&&snap.evaluations&&snap.evaluations.some(function(e){return e.liveCashMultiwayProfile&&e.liveCashMultiwayProfile.lane==='multiwayOnePairCall';}));
  });

  add('リングリバー: ワンペア大サイズコールを金額判断で重く見る',function(){
    const an=analyzeHand(ringRiverOnePairBigCallHand());
    const ev=humanEval(an,function(e){return e.street==='river'&&e.action==='call';});
    const labels=(an.liveCashScores||[]).map(function(s){return s.label;});
    return !!(ev&&ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.lane==='riverOnePairCatch'&&ev.liveCashRiverDecisionProfile.severity==='bad'&&ev.evalAxis==='リバーの金額判断'&&(ev.deduction||0)>=20&&labels.includes('リバー判断'));
  });

  add('リングリバー: 小さめ薄バリューはサイズ選択として肯定する',function(){
    const an=analyzeHand(ringRiverThinValueSmallHand());
    const ev=humanEval(an,function(e){return e.street==='river'&&(e.action==='raise'||e.action==='bet');});
    return !!(ev&&ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.lane==='riverThinValueSize'&&ev.liveCashRiverDecisionProfile.severity==='good'&&ev.quality!=='bad');
  });

  add('リングリバー: 完成寄りボードの大きいブラフを諦め候補にする',function(){
    const an=analyzeHand(ringRiverBadBluffHand());
    const ev=humanEval(an,function(e){return e.street==='river'&&(e.action==='raise'||e.action==='bet');});
    return !!(ev&&ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.lane==='riverBluffCandidate'&&ev.liveCashRiverDecisionProfile.severity==='bad'&&ev.evalAxis==='リバーの金額判断'&&(ev.deduction||0)>=14);
  });

  add('リングリバー: ワンペアチェックをポット管理として肯定する',function(){
    const an=analyzeHand(ringRiverPotControlCheckHand());
    const ev=humanEval(an,function(e){return e.street==='river'&&e.action==='check';});
    return !!(ev&&ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.lane==='riverPotControlCheck'&&ev.liveCashRiverDecisionProfile.severity==='good'&&ev.quality!=='bad'&&(ev.deduction||0)<=5);
  });

  add('リングリバー: 評価JSONにliveCashRiverDecisionProfileを保持する',function(){
    const hr=ringRiverOnePairBigCallHand();
    const an=analyzeHand(hr);
    const snap=evaluationSnapshot(hr,an);
    return !!(snap&&snap.evaluations&&snap.evaluations.some(function(e){return e.liveCashRiverDecisionProfile&&e.liveCashRiverDecisionProfile.lane==='riverOnePairCatch'&&e.liveCashRiverDecisionWeightNote;}));
  });

  add('リングリバー: 完成ボードのブロッカーなしワンペアコールを厳しく見る',function(){
    const an=analyzeHand(ringRiverOnePairBigCallHand());
    const ev=humanEval(an,function(e){return e.street==='river'&&e.action==='call';});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    return !!(p&&p.lane==='riverOnePairCatch'&&p.blocker&&p.blocker.severity==='bad'&&/ブロッカーなし/.test(p.risk)&&p.severity==='bad');
  });

  add('リングリバー: 単発小さめベットへの強ワンペアは境界に残す',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Qh'],
      board:['Ts','9s','4d','3c','2h'],
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:300,pot:1000,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'call',amount:300,pot:1300,toCall:300,potOdds:300/1600,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900})
      ],
      pot:1600
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    return !!(p&&p.lane==='riverOnePairCatch'&&p.severity==='border'&&ev.quality!=='bad'&&!/明確なコール/.test(ev.comment||''));
  });

  add('リングリバー: ワンペア薄バリューに支払いターゲットを持たせる',function(){
    const an=analyzeHand(ringRiverThinValueSmallHand());
    const ev=humanEval(an,function(e){return e.street==='river'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    return !!(p&&p.lane==='riverThinValueSize'&&p.thinTarget&&p.thinTarget.label&&/ターゲット=/.test(p.risk)&&/どの下のハンド/.test(p.policy));
  });

  add('リングリバーライン: 3バレル中サイズのワンペアコールを締める',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Qh'],
      board:['Ts','9s','4d','3c','2h'],
      decisions:[
        regressionDecision({street:'flop',action:'raise',amount:60,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'flop',action:'call',amount:60,pot:160,toCall:60,potOdds:60/220,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900}),
        regressionDecision({street:'turn',action:'raise',amount:140,pot:220,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:840}),
        regressionDecision({street:'turn',action:'call',amount:140,pot:360,toCall:140,potOdds:140/500,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:840}),
        regressionDecision({street:'river',action:'raise',amount:275,pot:500,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:700}),
        regressionDecision({street:'river',action:'call',amount:275,pot:775,toCall:275,potOdds:275/1050,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:700})
      ],
      pot:1050
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    return !!(p&&p.line&&p.line.label==='3バレル'&&p.severity==='bad'&&/3バレル/.test(p.risk)&&(ev.deduction||0)>=20);
  });

  add('リングリバーライン: 単発小さめリバーベットは3バレル扱いしない',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Qh'],
      board:['Ts','9s','4d','3c','2h'],
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:300,pot:1000,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'call',amount:300,pot:1300,toCall:300,potOdds:300/1600,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900})
      ],
      pot:1600
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    const txt=coachReviewText(ev);
    return !!(p&&p.line&&p.line.label==='単発リバーベット'&&p.severity==='border'&&ev.quality!=='bad'&&/リバーの一度だけ/.test(txt));
  });

  add('リングリバーライン: ターンコール後のリバーベットはバリュー密度を上げる',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Qh'],
      board:['Ts','9s','4d','3c','2h'],
      decisions:[
        regressionDecision({street:'turn',action:'raise',amount:180,pot:300,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900}),
        regressionDecision({street:'turn',action:'call',amount:180,pot:480,toCall:180,potOdds:180/660,facingRaise:true,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'raise',amount:360,pot:660,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:720}),
        regressionDecision({street:'river',action:'call',amount:360,pot:1020,toCall:360,potOdds:360/1380,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:720})
      ],
      pot:1380
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    return !!(p&&p.line&&p.line.label==='ターンコール後のリバーベット'&&p.severity==='bad'&&/完成役や強い継続/.test(coachReviewText(ev)));
  });

  add('リングリバーライン: ターンコール後のリバー薄バリューはサイズを絞る',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Qh'],
      board:['Ts','9s','4d','3c','2h'],
      decisions:[
        regressionDecision({street:'turn',action:'raise',amount:180,pot:300,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900}),
        regressionDecision({street:'turn',action:'call',amount:180,pot:480,toCall:180,potOdds:180/660,facingRaise:true,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'raise',amount:330,pot:660,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:720})
      ],
      pot:990
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    return !!(p&&p.line&&p.line.label==='ターンコール後のリバー継続'&&p.severity==='bad'&&/25〜45%pot|チェック/.test((p.suggest||'')+(ev.suggest||'')));
  });

  add('リングリバーレイズ対応: トップペアのコールしすぎを重く見る',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Qh'],
      board:['Ts','9s','4d','3c','2h'],
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:300,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'raise',amount:900,pot:1300,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'call',amount:600,pot:2200,toCall:600,potOdds:600/2800,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:600})
      ],
      pot:2800
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    return !!(p&&p.lane==='riverRaiseResponse'&&p.severity==='bad'&&/強いワンペア/.test(p.risk)&&ev.quality==='bad'&&(ev.deduction||0)>=22);
  });

  add('リングリバーレイズ対応: トップペアのフォールドを良い撤退にする',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Qh'],
      board:['Ts','9s','4d','3c','2h'],
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:300,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'raise',amount:900,pot:1300,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'fold',amount:0,pot:2200,toCall:600,potOdds:600/2800,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:600})
      ],
      pot:2200
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='fold';});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    return !!(p&&p.lane==='riverRaiseResponse'&&p.severity==='good'&&/良いフォールド/.test(p.verdict)&&ev.quality!=='bad'&&(ev.deduction||0)<=4);
  });

  add('リングリバーレイズ対応: ペアボード弱フラッシュのコールを危険視する',function(){
    const hr=regressionHand({
      heroHole:['4c','2c'],
      villainHole:['Ah','Kd'],
      board:['Js','8c','Qh','6c','Jc'],
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:30,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'river',action:'raise',amount:150,pot:130,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'river',action:'call',amount:120,pot:280,toCall:120,potOdds:120/400,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:470})
      ],
      pot:400
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    return !!(p&&p.lane==='riverRaiseResponse'&&p.severity==='bad'&&/弱いフラッシュ/.test(p.risk)&&ev.quality==='bad');
  });

  add('リングリバーレイズ対応: ナッツ級はレイズにも続行候補にする',function(){
    const hr=regressionHand({
      heroHole:['Ac','Kc'],
      villainHole:['Ah','Kd'],
      board:['Qc','8c','2c','7d','3h'],
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:300,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'raise',amount:900,pot:1300,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'call',amount:600,pot:2200,toCall:600,potOdds:600/2800,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:600})
      ],
      pot:2800
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    return !!(p&&p.lane==='riverRaiseResponse'&&p.severity==='good'&&/強手|続行/.test(p.verdict+p.policy)&&ev.quality!=='bad');
  });

  add('リングリバー: Aブロッカー付きトップペアは完成ボードでも境界に残す',function(){
    const hr=regressionHand({
      heroHole:['Ac','Qd'],
      villainHole:['Ah','Kd'],
      board:['Qc','8c','2c','7d','3h'],
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:450,pot:1000,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'call',amount:450,pot:1450,toCall:450,potOdds:450/1900,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900})
      ],
      pot:1900
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    const txt=ev?coachReviewText(ev):'';
    return !!(p&&p.lane==='riverOnePairCatch'&&p.blocker&&p.blocker.hasNutFlushBlocker&&p.severity==='border'&&/A♣|ナッツフラッシュ/.test(txt+p.blocker.label+p.blocker.coach));
  });

  add('リングリバー: ブロッカーなしの完成ボードブラフは厳しく見る',function(){
    const hr=regressionHand({
      heroHole:['Ah','Kd'],
      villainHole:['Qs','Qd'],
      board:['Qc','8c','2c','7d','3h'],
      decisions:[
        regressionDecision({street:'river',action:'raise',amount:550,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:900})
      ],
      pot:1550
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.liveCashRiverDecisionProfile;
    return !!(p&&p.lane==='riverBluffCandidate'&&p.blocker&&p.blocker.severity==='bad'&&p.severity==='bad'&&/ブロッカーなし/.test(p.blocker.label+p.risk));
  });

  add('COリンプ→BTNアイソコール側のフロップOOPチェックを重く罰しない',function(){
    const ev=humanEval(analyzeHand(limpIsoTopPairHand()),function(e){return e.street==='flop'&&e.action==='check';});
    return !!(ev&&ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane==='limpIsoOopCheck'&&ev.quality!=='bad'&&(ev.deduction||0)<=5&&ev.realizationPct<100&&/OOP/.test(ev.comment||''));
  });

  add('完成系ターンでトップペアの33%ベットを65%不足扱いしない',function(){
    const ev=humanEval(analyzeHand(limpIsoTopPairHand()),function(e){return e.street==='turn'&&(e.action==='raise'||e.action==='bet');});
    return !!(ev&&!/推奨:65%pot|65%pot/.test((ev.comment||'')+' '+(ev.suggest||'')));
  });

  add('完成ボードのリバートップペアコールを明確コールと言い切らない',function(){
    const ev=humanEval(analyzeHand(limpIsoTopPairHand()),function(e){return e.street==='river'&&e.action==='call';});
    return !!(ev&&ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane==='riverOnePairCall'&&(ev.evalAxis==='リバーのコール/フォールド'||ev.evalAxis==='リバーの金額判断')&&ev.axisTags&&ev.axisTags.includes('リバー圧力')&&!/明確なコール/.test(ev.comment||'')&&(ev.isMix||/ボーダー|若干|相手依存|ブラフキャッチ/.test(ev.comment||'')));
  });

  add('リバーワンペアの悪いコールは判断軸で重く補正する',function(){
    const hr=regressionHand({
      heroHole:['Ts','Qd'],
      villainHole:['Ah','Kh'],
      board:['Tc','9c','8c','5c','2h'],
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:5,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:15,pot:22,toCall:15,potOdds:15/37,facingRaise:true,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:37,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:485}),
        regressionDecision({street:'flop',action:'raise',amount:25,pot:37,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:485}),
        regressionDecision({street:'flop',action:'call',amount:25,pot:62,toCall:25,potOdds:25/87,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:485}),
        regressionDecision({street:'turn',action:'check',amount:0,pot:87,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:460}),
        regressionDecision({street:'turn',action:'raise',amount:75,pot:87,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:460}),
        regressionDecision({street:'turn',action:'call',amount:75,pot:162,toCall:75,potOdds:75/237,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:460}),
        regressionDecision({street:'river',action:'check',amount:0,pot:237,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:385}),
        regressionDecision({street:'river',action:'raise',amount:190,pot:237,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:385}),
        regressionDecision({street:'river',action:'call',amount:190,pot:427,toCall:190,potOdds:190/617,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:385})
      ],
      pot:617
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    return !!(ev&&(ev.evalAxis==='リバーのコール/フォールド'||ev.evalAxis==='リバーの金額判断')&&ev.deduction>=20&&(ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.lane==='riverOnePairCatch'||/リバー判断/.test(ev.axisWeightNote||'')));
  });

  add('ワンペア監査: ターン2バレル大サイズへのトップペアコールを明確コールと言い切らない',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Kc'],
      board:['Ts','9s','4d','8c'],
      decisions:[
        regressionDecision({street:'flop',action:'check',amount:0,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:12000}),
        regressionDecision({street:'flop',action:'raise',amount:700,pot:1000,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:12000}),
        regressionDecision({street:'flop',action:'call',amount:700,pot:1700,toCall:700,potOdds:700/2400,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:12000}),
        regressionDecision({street:'turn',action:'check',amount:0,pot:2400,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:11300}),
        regressionDecision({street:'turn',action:'raise',amount:1700,pot:2400,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:11300}),
        regressionDecision({street:'turn',action:'call',amount:1700,pot:4100,toCall:1700,potOdds:1700/5800,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:11300})
      ],
      pot:5800
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='turn'&&e.action==='call';});
    return !!(ev&&ev.onePairProfile&&ev.onePairProfile.verdict!=='normal'&&ev.quality!=='good'&&!/明確なコール/.test(ev.comment||''));
  });

  add('ワンペア監査: リバー3ストリート圧力のトップペアコールを受けすぎとして扱う',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Kc'],
      board:['Ts','9s','4d','8c','2h'],
      decisions:[
        regressionDecision({street:'flop',action:'check',amount:0,pot:1000,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:12000}),
        regressionDecision({street:'flop',action:'raise',amount:700,pot:1000,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:12000}),
        regressionDecision({street:'flop',action:'call',amount:700,pot:1700,toCall:700,potOdds:700/2400,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:12000}),
        regressionDecision({street:'turn',action:'check',amount:0,pot:2400,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:11300}),
        regressionDecision({street:'turn',action:'raise',amount:1700,pot:2400,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:11300}),
        regressionDecision({street:'turn',action:'call',amount:1700,pot:4100,toCall:1700,potOdds:1700/5800,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:11300}),
        regressionDecision({street:'river',action:'check',amount:0,pot:5800,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:9600}),
        regressionDecision({street:'river',action:'raise',amount:4300,pot:5800,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:9600}),
        regressionDecision({street:'river',action:'call',amount:4300,pot:10100,toCall:4300,potOdds:4300/14400,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:9600})
      ],
      pot:14400
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    return !!(ev&&ev.onePairProfile&&ev.onePairProfile.verdict==='bad'&&ev.quality==='bad'&&/フォールド寄り|ブラフ(が)?不足|受けすぎ/.test(ev.comment||''));
  });

  add('ワンペア監査: 動的ボードのトップペア大サイズベットを小〜中サイズ候補にする',function(){
    const hr=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Qh'],
      board:['Ts','9s','4d','8c'],
      decisions:[
        regressionDecision({street:'turn',action:'raise',amount:1800,pot:2400,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:12000})
      ],
      pot:4200
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='turn'&&e.action==='raise';});
    return !!(ev&&ev.onePairProfile&&ev.onePairProfile.verdict!=='normal'&&/小〜中サイズ|チェック/.test((ev.comment||'')+' '+(ev.suggest||'')));
  });

  add('コーチ文: 3ポケ下ペアをボードペア未絡み扱いしない',function(){
    const hr=regressionHand({
      heroHole:['3s','3d'],
      villainHole:['Ah','Kc'],
      board:['Qh','8d','5c','2s'],
      decisions:[
        regressionDecision({street:'turn',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:100
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='turn'&&e.action==='check';});
    const txt=coachReviewText(ev);
    return !!(ev&&ev.onePairProfile&&ev.onePairProfile.pairTier==='under_pair'&&/ポケットペア|下のペア/.test(txt)&&!/ボードのペアにキッカー/.test(txt));
  });

  add('コーチ文: BBレンジ外コールは詳細を開かず理由が分かる',function(){
    const players=[
      regressionPlayer('あなた',true,['7c','2d'],{chips:500}),
      regressionPlayer('utg',false,['Ah','Ad'],{chips:500})
    ];
    const hr=regressionHand({
      players:players,
      heroHole:['7c','2d'],
      villainHole:['Ah','Ad'],
      board:[],
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:5,facingRaise:false,position:'UTG',playerName:'utg',isHuman:false,playerIdx:1,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:22,toCall:10,potOdds:10/32,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:495,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ],
      pot:32
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='preflop'&&e.action==='call';});
    const txt=coachReviewText(ev);
    return !!(ev&&ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane==='bbDefend'&&/UTGオープン相手|防衛目安|上位\d+%/.test(txt)&&/フロップ前/.test(txt)&&!/プリフロップ/.test(txt));
  });

  add('リング参加レンジ: 42sのBB下限コールをS評価にしない',function(){
    const players=[
      regressionPlayer('あなた',true,['4c','2c'],{chips:500}),
      regressionPlayer('btn',false,['Ah','Kd'],{chips:500})
    ];
    const hr=regressionHand({
      players:players,
      heroHole:['4c','2c'],
      villainHole:['Ah','Kd'],
      board:[],
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:14,pot:7,toCall:5,facingRaise:false,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'call',amount:9,pot:21,toCall:9,potOdds:9/30,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:495,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:2})
      ],
      pot:30
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='preflop'&&e.action==='call';});
    const rangeScore=an.liveCashScores&&an.liveCashScores.find(function(s){return s.label==='参加レンジ';});
    return !!(ev&&ev.deduction>=6&&ev.quality==='ok'&&rangeScore&&rangeScore.grade!=='S'&&/フォールド寄り/.test((ev.suggest||'')+coachReviewText(ev)));
  });

  add('リバー評価: ペアボードの4ハイフラッシュを強い取り切り扱いしない',function(){
    const players=[
      regressionPlayer('あなた',true,['4c','2c'],{chips:500}),
      regressionPlayer('btn',false,['Ah','Kd'],{chips:500})
    ];
    const hr=regressionHand({
      players:players,
      heroHole:['4c','2c'],
      villainHole:['Ah','Kd'],
      board:['Js','8c','Qh','6c','Jc'],
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:14,pot:7,toCall:5,facingRaise:false,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'preflop',action:'call',amount:9,pot:21,toCall:9,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:495}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:30,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:486}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:30,toCall:0,facingRaise:false,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:486}),
        regressionDecision({street:'turn',action:'check',amount:0,pot:30,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:486}),
        regressionDecision({street:'turn',action:'check',amount:0,pot:30,toCall:0,facingRaise:false,position:'BTN',playerName:'btn',isHuman:false,playerIdx:1,playerChipsBefore:486}),
        regressionDecision({street:'river',action:'bet',amount:15,pot:30,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:486})
      ],
      pot:45
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='river'&&(e.action==='bet'||e.action==='raise');});
    const txt=coachReviewText(ev);
    return !!(ev&&ev.liveCashRiverDecisionProfile&&/弱フラッシュ/.test(ev.liveCashRiverDecisionProfile.verdict+ev.liveCashRiverDecisionProfile.policy+txt)&&/25〜40%pot|小さめ/.test(ev.liveCashRiverDecisionProfile.suggest+txt)&&!/強い完成役はリバーで取り切ります/.test(txt));
  });

  add('レビューUI: 詳細データを折りたたみ表示しない',function(){
    return compactReviewDetailsHTML(null,'<span>詳細</span>')==='';
  });

  add('コーチ文: 混合ラインは比率を表示する',function(){
    const txt=coachReviewText({street:'flop',action:'check',quality:'ok',isMix:true,freqPct:57,comment:'チェック。',suggest:''});
    return /チェック 57% \/ ベット 43%/.test(txt);
  });

  add('コーチ文: 圧力0段階を不自然に表示しない',function(){
    const txt=naturalRiskText('SPR約5 / 比較的静的なボード / 圧力0段階');
    return /まだ入っていません/.test(txt)&&!/0段階あります/.test(txt);
  });

  add('コーチ文: 最終整文で硬い重複表現を減らす',function(){
    const txt=polishCoachReviewText('ここは見直したい判断です。リングゲームのリバーです。今回のベットは50%potで、完成寄りボードです。ここは複数の選択肢があります。GTOでは混ざることがありますが、実戦では相手依存です。', {street:'river'});
    return /リングゲームのリバーで、見直したい判断です/.test(txt)&&/複数のラインが成立します/.test(txt)&&!/ここは見直したい判断です。リングゲームのリバーです|GTOでは/.test(txt)&&(txt.match(/。/g)||[]).length<=4;
  });

  add('コーチ文: ポストフロップ表示は長文化させない',function(){
    const txt=coachReviewText({
      street:'river',
      action:'fold',
      quality:'good',
      suggest:'このラインを継続してください',
      comment:'フォールド。',
      liveCashRiverDecisionProfile:{lane:'riverDisciplineFold',policy:'完成ボードでワンペアは無理に受けません。',risk:'サイズ117%pot / 完成寄りボード / 相手圧力1回'},
      boardTextureProfile:{dynamic:true,straightThreat:true,paired:false},
      rangeActionUpdateProfile:{street:'river',lane:'fold',sizePct:117,rangeState:'single_pressure',pressure:1,severity:'good'}
    });
    return txt.length<360&&!/「完成寄り\/動的ボード」|レンジ更新は|GTO基準/.test(txt)&&/フォールド|問題ありません/.test(txt);
  });

  add('コーチ文: 複数ラインの比率は短文化しても残す',function(){
    const txt=coachReviewText({
      street:'flop',
      action:'check',
      quality:'ok',
      isMix:true,
      freqPct:57,
      comment:'チェック。',
      suggest:'ベットするならポットの33% (17T)',
      boardTextureProfile:{dynamic:true,straightThreat:true},
      onePairProfile:{policy:'弱めのワンペアはポット管理が中心です。',risk:'SPR約8 / 完成寄りボード / 圧力0段階'}
    });
    return /チェック 57% \/ ベット 43%/.test(txt)&&txt.length<420;
  });

  add('実地監査: 長すぎるレビュー文を検出する',function(){
    const long='これは長すぎるレビューです。'.repeat(35);
    const issues=auditIssuesForHand({players:[]},{evals:[{street:'turn',action:'bet',quality:'ok',coachComment:long}]});
    return issues.some(function(i){return i.type==='review-too-long'&&i.severity==='medium';});
  });

  add('実地監査: ブラフ候補説明の長文化を検出する',function(){
    const long='ブラフ候補として見ると、これは条件付きです。コールしてほしい相手と降ろしたい相手を整理します。'.repeat(12);
    const issues=auditIssuesForHand({players:[]},{evals:[{
      street:'flop',
      action:'bet',
      quality:'ok',
      coachComment:long,
      postflopBetPurposeProfile:{bluffCandidate:{kind:'条件不足のブラフ候補'}}
    }]});
    return issues.some(function(i){return i.type==='bluff-comment-too-long'&&i.severity==='medium';});
  });

  add('実地監査: レビュー文の同一語句重複を検出する',function(){
    const txt='コールしてほしい相手を確認します。コールしてほしい相手は弱いペアです。コールしてほしい相手が少ないです。';
    const issues=auditIssuesForHand({players:[]},{evals:[{street:'flop',action:'bet',quality:'ok',coachComment:txt}]});
    return issues.some(function(i){return i.type==='review-duplicate-phrase'&&i.meta&&i.meta.phrase==='コールしてほしい相手';});
  });

  add('トリップス監査: Aトリップスを弱いワンペア扱いしない',function(){
    const hr=regressionHand({
      heroHole:['As','Kd'],
      villainHole:['Qh','Qc'],
      board:['Ah','Ac','7s'],
      decisions:[
        regressionDecision({street:'flop',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'raise',amount:35,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:35,pot:135,toCall:35,potOdds:35/170,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:170
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='flop'&&e.action==='call';});
    const role=handRole(hr.players[0].holeCards,hr.community.slice(0,3),HandEval.evaluate([...hr.players[0].holeCards,...hr.community.slice(0,3)]));
    const txt=coachReviewText(ev);
    return !!(role&&role.madeClass==='trips'&&role.role==='strong'&&ev&&!ev.onePairProfile&&!/弱いワンペア|ボードのペアにキッカー/.test(txt));
  });

  add('クアッズ監査: フォーカードをワンペア監査に流さない',function(){
    const hr=regressionHand({
      heroHole:['As','Kd'],
      villainHole:['Qh','Qc'],
      board:['Ah','Ac','Ad'],
      decisions:[
        regressionDecision({street:'flop',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'raise',amount:35,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:35,pot:135,toCall:35,potOdds:35/170,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:170
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='call';});
    const role=handRole(hr.players[0].holeCards,hr.community.slice(0,3),HandEval.evaluate([...hr.players[0].holeCards,...hr.community.slice(0,3)]));
    return !!(role&&role.madeClass==='quads'&&ev&&!ev.onePairProfile);
  });

  function threeBetUnderpairHand(){
    const players=[
      regressionPlayer('あなた',true,['7h','7d'],{chips:500}),
      regressionPlayer('dai',false,['Ah','Ac'],{chips:500})
    ];
    return regressionHand({
      players:players,
      board:['Kh','4h','8d','Qc'],
      bigBlind:5,
      pot:193,
      pfStory:{narrative:'UTG open -> MP 3BET -> UTG call'},
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:16,pot:7,toCall:5,facingRaise:false,position:'UTG',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500,pfRaiseCountBefore:0,pfFacingBetLevel:0,pfActionBetLevel:2}),
        regressionDecision({street:'preflop',action:'raise',amount:48,pot:23,toCall:16,facingRaise:true,position:'MP',playerName:'dai',isHuman:false,playerIdx:1,playerChipsBefore:500,pfRaiseCountBefore:1,pfFacingBetLevel:2,pfActionBetLevel:3}),
        regressionDecision({street:'preflop',action:'call',amount:32,pot:55,toCall:32,potOdds:32/87,facingRaise:true,position:'UTG',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:484,playerBetBefore:16,pfRaiseCountBefore:2,pfFacingBetLevel:3,pfActionBetLevel:3}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:87,toCall:0,facingRaise:false,position:'UTG',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:452}),
        regressionDecision({street:'flop',action:'raise',amount:29,pot:87,toCall:0,facingRaise:false,position:'MP',playerName:'dai',isHuman:false,playerIdx:1,playerChipsBefore:452}),
        regressionDecision({street:'flop',action:'call',amount:29,pot:116,toCall:29,potOdds:29/145,facingRaise:true,position:'UTG',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:452}),
        regressionDecision({street:'turn',action:'check',amount:0,pot:145,toCall:0,facingRaise:false,position:'UTG',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:423}),
        regressionDecision({street:'turn',action:'raise',amount:48,pot:145,toCall:0,facingRaise:false,position:'MP',playerName:'dai',isHuman:false,playerIdx:1,playerChipsBefore:423}),
        regressionDecision({street:'turn',action:'fold',amount:0,pot:193,toCall:48,potOdds:48/241,facingRaise:true,position:'UTG',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:423})
      ]
    });
  }

  add('3BETポットOOPの77ターン下ペアフォールドを明確ミス扱いしない',function(){
    const ev=humanEval(analyzeHand(threeBetUnderpairHand()),function(e){return e.street==='turn'&&e.action==='fold';});
    return !!(ev&&ev.quality!=='bad'&&(ev.deduction||0)<=2&&/3BET\/OOP|フォールドが有力|明確なフォールド/.test(ev.comment||''));
  });

  add('3BETポットOOPの77フロップ小CBコールを明確コールと言い切らない',function(){
    const ev=humanEval(analyzeHand(threeBetUnderpairHand()),function(e){return e.street==='flop'&&e.action==='call';});
    return !!(ev&&!/明確なコール/.test(ev.comment||'')&&(ev.quality==='ok'||ev.isMix||/若干|ボーダー/.test(ev.comment||'')));
  });

  add('小ポットでもポストフロップのクイックベット選択肢を十分に出す',function(){
    const opts=postflopQuickBetOptions(7,5,285);
    const labels=opts.map(function(o){return o.label;});
    return opts.length>=5&&['33%','50%','75%','100%','125%'].every(function(x){return labels.includes(x);});
  });

  add('size training: recommended bet size snaps to standard buttons',function(){
    return standardBetSizePct(40)===33&&standardBetSizePct(45)===50&&standardBetSizePct(65)===75&&standardBetSizePct(112)===100;
  });

  add('size training: preflop quick open uses 2BB/2.5BB/3BB',function(){
    const opts=preflopOpenQuickOptions(200,5000);
    const labels=opts.map(function(o){return o.label;});
    return ['2BB','2.5BB','3BB'].every(function(x){return labels.includes(x);});
  });

  add('size training: facing raise quick options use 2x/3x/4x/5x',function(){
    const opts=raiseOverBetQuickOptions(600,800,5000);
    const labels=opts.map(function(o){return o.label;});
    return ['2x','3x','4x','5x'].every(function(x){return labels.includes(x);});
  });

  add('size training: cautious one-pair plan returns standard sizes',function(){
    const plan=cautiousOnePairBetPlan(100,{street:'flop'},{role:'value',pairTier:'top_pair'},{flushDraw:true,dynamic:true},false);
    return !!(plan&&[33,50,75,100,125].includes(plan.pct));
  });

  add('新ハンド開始時に前ハンドのアクション表示を消す',function(){
    const g=new GameEngine({sb:2,bb:5,aiLevel:'medium',startingChips:500,numPlayers:6});
    g.handNum=9;
    g._lastActions={0:{action:'fold',amount:0,ts:Date.now(),handNum:8},1:{action:'fold',amount:0,ts:Date.now(),handNum:8}};
    g.startHand();
    return !!(g.handNum===10&&g._lastActions&&Object.keys(g._lastActions).length===0);
  });

  add('GTOボード分類: モノトーン/ペア/連結を独立プロファイルで保持する',function(){
    const mono=boardTextureProfile(regressionCards(['Ah','Th','4h']),'flop',[]);
    const pair=boardTextureProfile(regressionCards(['Kd','Kc','7s']),'flop',[]);
    const conn=boardTextureProfile(regressionCards(['9h','8c','7d']),'flop',[]);
    return !!(mono&&mono.primary==='monotone'&&mono.flushThreat&&pair&&pair.primary==='paired'&&pair.nutVolatility==='fullhouse/quads'&&conn&&conn.straightThreat&&/connected/.test(conn.primary));
  });

  add('GTOボード分類: ターン/リバーの変化カードを検出する',function(){
    const flush=boardTextureProfile(regressionCards(['Ah','Th','4c','2h']),'turn',regressionCards(['Ah','Th','4c']));
    const over=boardTextureProfile(regressionCards(['9h','6c','2d','Kd']),'turn',regressionCards(['9h','6c','2d']));
    const paired=boardTextureProfile(regressionCards(['Qh','8c','2d','8s']),'turn',regressionCards(['Qh','8c','2d']));
    return !!(flush&&flush.transition==='flush_complete_card'&&over&&over.transition==='overcard'&&paired&&paired.transition==='board_pair');
  });

  add('GTO頻度: A-high dryはPFR小さめ高頻度、重いボードは頻度を落とす',function(){
    const dry=boardTextureProfile(regressionCards(['Ad','9c','3s']),'flop',[]);
    const mono=boardTextureProfile(regressionCards(['Ah','Th','4h']),'flop',[]);
    const conn=boardTextureProfile(regressionCards(['9h','8c','7d']),'flop',[]);
    const dryAdj=boardTextureFrequencyAdjustment(0.55,dry,{street:'flop',isPfr:true,role:{role:'air'},nOpponents:1});
    const monoAdj=boardTextureFrequencyAdjustment(0.55,mono,{street:'flop',isPfr:true,role:{role:'air'},nOpponents:1});
    const connAdj=boardTextureFrequencyAdjustment(0.60,conn,{street:'flop',isPfr:true,role:{role:'air'},nOpponents:1});
    return !!(dryAdj.betPct>55&&dryAdj.preferredSizePct===33&&monoAdj.betPct<55&&connAdj.betPct<60);
  });

  add('GTOサイズ: ボード別に33/50/75系の推奨サイズを分ける',function(){
    const dry=boardTextureProfile(regressionCards(['Ad','9c','3s']),'flop',[]);
    const mono=boardTextureProfile(regressionCards(['Ah','Th','4h']),'flop',[]);
    const conn=boardTextureProfile(regressionCards(['9h','8c','7d']),'flop',[]);
    const dryPlan=boardTextureSizePlan(100,dry,{role:'air'},{street:'flop',isPfr:true,nOpponents:1,mode:'gto'});
    const monoPlan=boardTextureSizePlan(100,mono,{role:'value',pairTier:'top_pair'},{street:'flop',isPfr:true,nOpponents:1,mode:'gto'});
    const connStrong=boardTextureSizePlan(100,conn,{role:'strong'},{street:'flop',isPfr:true,nOpponents:1,mode:'gto'});
    const connOnePair=boardTextureSizePlan(100,conn,{role:'value',pairTier:'top_pair'},{street:'flop',isPfr:true,nOpponents:1,mode:'gto'});
    return !!(dryPlan&&dryPlan.pct===33&&monoPlan&&monoPlan.pct===33&&connStrong&&connStrong.pct>=75&&connOnePair&&connOnePair.pct<=50);
  });

  add('GTO変化カード: フラッシュ完成やボードペア化で非ナッツ大サイズを重く見る',function(){
    const flush=boardTextureProfile(regressionCards(['Kh','7h','2c','4h']),'turn',regressionCards(['Kh','7h','2c']));
    const pair=boardTextureProfile(regressionCards(['Qd','8c','2s','8h']),'turn',regressionCards(['Qd','8c','2s']));
    const flushProf=boardTextureTransitionProfile(regressionDecision({street:'turn',action:'call',amount:70,pot:100,toCall:70}),flush,{role:'value',pairTier:'top_pair'},{isPfr:false});
    const pairProf=boardTextureTransitionProfile(regressionDecision({street:'turn',action:'bet',amount:70,pot:100,toCall:0}),pair,{role:'value',isVuln:true},{isPfr:true});
    return !!(flushProf&&flushProf.severity==='bad'&&flushProf.axis==='フラッシュ完成カード'&&pairProf&&pairProf.severity==='bad'&&pairProf.axis==='ボードペア化');
  });

  add('GTOターン意味: PFRに良いオーバーカードは小さめ2発目を残す',function(){
    const tex=boardTextureProfile(regressionCards(['9h','6c','2d','Kd']),'turn',regressionCards(['9h','6c','2d']));
    const prof=postflopBarrelPlanProfile(regressionHand({decisions:[
      regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0,playerName:'あなた',isHuman:true,playerIdx:0}),
      regressionDecision({street:'flop',action:'call',amount:33,pot:133,toCall:33,playerName:'villain',isHuman:false,playerIdx:1}),
      regressionDecision({street:'turn',action:'bet',amount:40,pot:166,toCall:0,playerName:'あなた',isHuman:true,playerIdx:0})
    ]}),regressionDecision({street:'turn',action:'bet',amount:40,pot:166,toCall:0,playerName:'あなた',isHuman:true,playerIdx:0}),{role:'air'},tex,null,null,{isPfr:true});
    return !!(prof&&prof.turnMeaning&&prof.turnMeaning.favors==='pfr'&&prof.rangeGood&&prof.severity!=='bad');
  });

  add('GTOターン意味: 完成カードでは弱い手のチェックを肯定する',function(){
    const tex=boardTextureProfile(regressionCards(['Kh','7h','2c','4h']),'turn',regressionCards(['Kh','7h','2c']));
    const prof=postflopBarrelPlanProfile(regressionHand({decisions:[
      regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0,playerName:'あなた',isHuman:true,playerIdx:0}),
      regressionDecision({street:'flop',action:'call',amount:33,pot:133,toCall:33,playerName:'villain',isHuman:false,playerIdx:1}),
      regressionDecision({street:'turn',action:'check',amount:0,pot:166,toCall:0,playerName:'あなた',isHuman:true,playerIdx:0})
    ]}),regressionDecision({street:'turn',action:'check',amount:0,pot:166,toCall:0,playerName:'あなた',isHuman:true,playerIdx:0}),{role:'air'},tex,null,null,{isPfr:true});
    return !!(prof&&prof.turnMeaning&&prof.turnMeaning.barrel==='slow_down'&&prof.severity==='good'&&/フラッシュ/.test(prof.policy));
  });

  add('GTOボード分類: 評価JSONとGTOスナップショットに保持する',function(){
    const hr=regressionHand({
      heroHole:['As','Qd'],
      villainHole:['Kh','Kc'],
      board:['Ah','Th','4h'],
      decisions:[regressionDecision({street:'flop',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})],
      pot:100
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='flop'&&e.action==='check';});
    const snap=evaluationSnapshot(hr,an);
    const se=snap&&snap.evaluations&&snap.evaluations[0];
    return !!(ev&&ev.boardTextureProfile&&ev.boardTextureProfile.primary==='monotone'&&ev.boardTextureMixProfile&&ev.gtoTheory&&ev.gtoTheory.boardTexture&&ev.gtoTheory.boardTextureMix&&se&&se.boardTextureProfile&&se.boardTextureMixProfile&&se.gtoTheory&&se.gtoTheory.boardTexture&&se.gtoTheory.boardTextureMix);
  });

  add('GTOサイズ: ベット評価JSONにボード別サイズプランを保持する',function(){
    const hr=regressionHand({
      heroHole:['As','Kd'],
      villainHole:['Qh','Qs'],
      board:['Ad','9c','3s'],
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:22,toCall:10,facingRaise:true,position:'BB',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:485})
      ],
      pot:133
    });
    setRangeMode('gto');
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='flop'&&e.action==='bet';});
    const snap=evaluationSnapshot(hr,an);
    const se=snap&&snap.evaluations&&snap.evaluations.find(function(e){return e.street==='flop'&&e.action==='bet';});
    setRangeMode('live');
    return !!(ev&&ev.boardTextureSizeProfile&&ev.boardTextureSizeProfile.pct===33&&ev.gtoTheory&&ev.gtoTheory.boardTextureSize&&se&&se.boardTextureSizeProfile&&se.gtoTheory&&se.gtoTheory.boardTextureSize);
  });

  add('GTO変化カード: 実評価JSONに変化カード補正を保持する',function(){
    const hr=regressionHand({
      heroHole:['Ah','Kd'],
      villainHole:['Qs','Qd'],
      board:['Kh','7h','2c','4h'],
      decisions:[
        regressionDecision({street:'turn',action:'bet',amount:70,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'turn',action:'call',amount:70,pot:170,toCall:70,potOdds:70/240,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:240
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='turn'&&e.action==='call';});
    const snap=evaluationSnapshot(hr,an);
    const se=snap&&snap.evaluations&&snap.evaluations.find(function(e){return e.street==='turn'&&e.action==='call';});
    return !!(ev&&ev.boardTextureTransitionProfile&&ev.boardTextureTransitionProfile.severity==='bad'&&(ev.deduction||0)>=18&&ev.gtoTheory&&ev.gtoTheory.boardTextureTransition&&se&&se.boardTextureTransitionProfile&&se.boardTextureTransitionWeightNote);
  });

  add('GTOレンジ/ナッツ優位: A-high dryのPFR小CBを肯定し低連結の大きい空CBを抑える',function(){
    const dry=boardTextureProfile(regressionCards(['Ad','9c','3s']),'flop',[]);
    const low=boardTextureProfile(regressionCards(['9h','8c','7d']),'flop',[]);
    const dryProf=rangeNutAdvantageProfile(regressionHand({}),regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0}),dry,{role:'air'},{isPfr:true});
    const lowProf=rangeNutAdvantageProfile(regressionHand({}),regressionDecision({street:'flop',action:'bet',amount:70,pot:100,toCall:0}),low,{role:'air'},{isPfr:true});
    return !!(dryProf&&dryProf.heroRangeAdv==='高'&&dryProf.severity==='good'&&lowProf&&lowProf.heroNutAdv==='低'&&lowProf.severity==='bad');
  });

  add('GTOレンジ/ナッツ優位: 高いペアボードはPFR側、低いペアボードは受け側を厚く見る',function(){
    const highPair=boardTextureProfile(regressionCards(['Ah','Ad','7c']),'flop',[]);
    const lowPair=boardTextureProfile(regressionCards(['7h','7d','2c']),'flop',[]);
    const highProf=rangeNutAdvantageProfile(regressionHand({}),regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0}),highPair,{role:'air'},{isPfr:true});
    const lowProf=rangeNutAdvantageProfile(regressionHand({}),regressionDecision({street:'flop',action:'bet',amount:70,pot:100,toCall:0}),lowPair,{role:'air'},{isPfr:true});
    return !!(highPair&&highPair.pairClass==='high_pair'&&highProf&&highProf.heroRangeAdv==='高'&&highProf.heroNutAdv==='高'&&lowPair&&lowPair.pairClass==='low_pair'&&lowProf&&lowProf.heroNutAdv==='低'&&lowProf.severity==='bad');
  });

  add('GTOレンジ/ナッツ優位: 低いモノトーンは受け側ナッツ絡みを残す',function(){
    const mono=boardTextureProfile(regressionCards(['8h','6h','3h']),'flop',[]);
    const prof=rangeNutAdvantageProfile(regressionHand({}),regressionDecision({street:'flop',action:'bet',amount:60,pot:100,toCall:0}),mono,{role:'air'},{isPfr:true});
    return !!(mono&&mono.primary==='monotone'&&prof&&prof.heroRangeAdv==='中'&&prof.heroNutAdv==='低'&&prof.severity==='bad');
  });

  add('GTOレンジ/ナッツ優位: 評価JSONとGTOスナップショットに保持する',function(){
    const hr=regressionHand({
      heroHole:['As','Kd'],
      villainHole:['Qh','Qs'],
      board:['Ad','9c','3s'],
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:22,toCall:10,facingRaise:true,position:'BB',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:485})
      ],
      pot:133
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='flop'&&e.action==='bet';});
    const snap=evaluationSnapshot(hr,an);
    const se=snap&&snap.evaluations&&snap.evaluations.find(function(e){return e.street==='flop'&&e.action==='bet';});
    return !!(ev&&ev.rangeNutAdvantageProfile&&ev.rangeNutAdvantageProfile.heroRangeAdv==='高'&&ev.gtoTheory&&ev.gtoTheory.rangeNutAdvantage&&se&&se.rangeNutAdvantageProfile&&se.gtoTheory&&se.gtoTheory.rangeNutAdvantage);
  });

  add('監査バッチが複数モードを回して違和感一覧を返す',function(){
    const b=runFishTankAuditBatch({perMode:1,seed:24680,maxExamples:8,maxActions:70});
    return !!(b&&b.totalHands>=6&&b.byMode&&b.byMode.scenario&&Array.isArray(b.suspiciousHands)&&typeof fishTankAuditBatchReportText(b)==='string');
  });

  add('20BB reshove監査でAI非BBフラット前提を出さない',function(){
    const b=runFishTankAuditBatch({perMode:1,seed:20260605,maxExamples:12,maxActions:90});
    const h=(b.suspiciousHands||[]).filter(function(x){return x.modeId==='tournament:reshove20';});
    return !h.some(function(x){return (x.issues||[]).some(function(i){return i.type==='premise-context';});});
  });

  add('監査抽出が実ハンド混入FAILをcriticalとして拾う',function(){
    const hr=regressionHand({heroHole:['As','Kd'],villainHole:['Qh','Qs']});
    const issues=auditIssuesForHand(hr,{score:80,grade:'B',evals:[],actualHandAudit:{status:'FAIL',hiddenCardTextLeaks:1,evalInvariant:false},premiseAudit:{issues:[],warnings:[]}},'unit');
    return issues.some(function(i){return i.severity==='critical'&&i.type==='hidden-hand-leak';});
  });

  add('実ハンド混入監査: K5s表記を実カード5s漏れと誤検知しない',function(){
    const hr=regressionHand({heroHole:['Kc','5c'],villainHole:['As','5s'],board:[]});
    const safe={gradeLabel:'',primaryLesson:null,premiseAudit:{issues:[],warnings:[]},evals:[{comment:'K5sはバブルでは受けすぎ注意です。'}]};
    const leak={gradeLabel:'',primaryLesson:null,premiseAudit:{issues:[],warnings:[]},evals:[{comment:'相手の 5s が見えている前提です。'}]};
    return actualHandTextLeakCount(hr,safe)===0&&actualHandTextLeakCount(hr,leak)>0;
  });

  add('監査抽出が肯定コメントと大減点の矛盾を拾う',function(){
    const hr=regressionHand({heroHole:['As','Kd'],villainHole:['Qh','Qs']});
    const an={score:70,grade:'C',evals:[{street:'river',action:'call',isHuman:true,quality:'bad',deduction:18,comment:'正解。合理的なコールです。'}],actualHandAudit:{status:'PASS'},premiseAudit:{issues:[],warnings:[]}};
    const issues=auditIssuesForHand(hr,an,'unit');
    return issues.some(function(i){return i.type==='comment-deduction-contradiction';});
  });

  add('監査抽出: AIレンジ違和感を文脈破綻と分ける',function(){
    const hr=regressionHand({heroHole:['As','Kd'],villainHole:['Qh','Qs']});
    const an={score:90,grade:'A',evals:[],actualHandAudit:{status:'PASS'},premiseAudit:{issues:[{text:'AI前提 villain[BB] 非公開ハンド: BB defend目安 上位50% -> 不自然'}],warnings:[]}};
    const issues=auditIssuesForHand(hr,an,'unit');
    return issues.some(function(i){return i.type==='ai-preflop-premise'&&i.severity==='medium';})&&!issues.some(function(i){return i.type==='premise-context';});
  });

  add('監査バッチ候補に再現用のmodeIdとsampleIndexを保持する',function(){
    const b=runFishTankAuditBatch({perMode:1,seed:97531,maxExamples:8,maxActions:70});
    const h=b.suspiciousHands&&b.suspiciousHands[0];
    return !h||!!(h.modeId&&h.sampleIndex>=1);
  });

  add('監査修正キューがissue種別ごとに優先度を作る',function(){
    const summary={seed:1,perMode:1,suspiciousHands:[
      {mode:'unit',modeId:'ring',sampleIndex:1,handNum:1,hero:'As Kd',board:'',issues:[{severity:'high',type:'premise-context',text:'x'}]},
      {mode:'unit',modeId:'ring',sampleIndex:2,handNum:2,hero:'Qs Qd',board:'',issues:[{severity:'critical',type:'hidden-hand-leak',text:'y'}]}
    ]};
    summary.repairQueue=buildFishTankAuditRepairQueue(summary);
    const text=fishTankAuditRepairPlanText(summary);
    return summary.repairQueue.queue[0].type==='hidden-hand-leak'&&/再現: runFishTankAuditBatch/.test(text);
  });

  add('GTOレンジ更新: 複数ストリート圧力とチェックキャップを区別する',function(){
    const wet=boardTextureProfile(regressionCards(['Th','9h','4d','8c','2s']),'river',regressionCards(['Th','9h','4d','8c']));
    const hrCall=regressionHand({
      heroHole:['As','Td'],
      villainHole:['Kh','Kc'],
      board:['Th','9h','4d','8c','2s'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:70,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:70,pot:170,toCall:70,potOdds:70/240,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'turn',action:'bet',amount:170,pot:240,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:430}),
        regressionDecision({street:'turn',action:'call',amount:170,pot:410,toCall:170,potOdds:170/580,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:430}),
        regressionDecision({street:'river',action:'bet',amount:430,pot:580,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:260}),
        regressionDecision({street:'river',action:'call',amount:430,pot:1010,toCall:430,potOdds:430/1440,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:260})
      ],
      pot:1440
    });
    const prof=rangeActionUpdateProfile(hrCall,hrCall.decisions[5],wet,{role:'value',pairTier:'top_pair'},{});
    const dry=boardTextureProfile(regressionCards(['Ad','9c','3s']),'flop',[]);
    const hrBet=regressionHand({
      heroHole:['Kc','Qc'],
      villainHole:['7h','7d'],
      board:['Ad','9c','3s'],
      decisions:[
        regressionDecision({street:'flop',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:133
    });
    const cap=rangeActionUpdateProfile(hrBet,hrBet.decisions[1],dry,{role:'air'},{heroRangeAdv:'high'});
    return !!(prof&&prof.pressure>=2&&prof.severity==='border'&&cap&&cap.cappedByCheck&&cap.severity==='good');
  });

  add('GTOレンジ更新: 評価JSONとGTOスナップショットに保持する',function(){
    const hr=regressionHand({
      heroHole:['As','Kd'],
      villainHole:['Qh','Qs'],
      board:['Ad','9c','3s'],
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:22,toCall:10,potOdds:10/32,facingRaise:true,position:'BB',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:490}),
        regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:485})
      ],
      pot:133
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='flop'&&e.action==='bet';});
    const snap=evaluationSnapshot(hr,an);
    const se=snap&&snap.evaluations&&snap.evaluations.find(function(e){return e.street==='flop'&&e.action==='bet';});
    return !!(ev&&ev.rangeActionUpdateProfile&&ev.gtoTheory&&ev.gtoTheory.rangeActionUpdate&&se&&se.rangeActionUpdateProfile&&se.gtoTheory&&se.gtoTheory.rangeActionUpdate);
  });

  add('ポストフロップベット目的: 強いドローのセミブラフを肯定する',function(){
    const hr=regressionHand({
      heroHole:['Ah','Kh'],
      villainHole:['7c','7d'],
      board:['Qh','8h','2c'],
      decisions:[
        regressionDecision({street:'flop',action:'raise',amount:50,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:150
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.postflopBetPurposeProfile;
    return !!(p&&p.lane==='semiBluff'&&p.severity==='good'&&ev.quality!=='bad'&&/セミブラフ/.test(coachReviewText(ev)+p.purpose+p.policy));
  });

  add('ポストフロップベット目的: 弱いワンペアの大きいベットを目的不足として見る',function(){
    const hr=regressionHand({
      heroHole:['7s','6s'],
      villainHole:['Ah','Kd'],
      board:['Kc','7d','2h'],
      decisions:[
        regressionDecision({street:'flop',action:'raise',amount:80,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:180
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.postflopBetPurposeProfile;
    return !!(p&&p.lane==='weakMadeBet'&&p.severity==='bad'&&ev.quality==='bad'&&/弱い完成役|プロテクション/.test(coachReviewText(ev)+p.policy));
  });

  add('ポストフロップベット目的: A-high dryの小さめCBをレンジCBとして扱う',function(){
    const hr=regressionHand({
      heroHole:['Kc','Qc'],
      villainHole:['7h','7d'],
      board:['Ad','9c','3s'],
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:22,toCall:10,potOdds:10/32,facingRaise:true,position:'BB',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:490}),
        regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:485})
      ],
      pot:133
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.postflopBetPurposeProfile;
    const snap=evaluationSnapshot(hr,analyzeHand(hr));
    const se=snap&&snap.evaluations&&snap.evaluations.find(function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    return !!(p&&p.lane==='rangeCbet'&&p.severity==='good'&&ev.quality!=='bad'&&se&&se.postflopBetPurposeProfile&&/レンジCB/.test(coachReviewText(ev)+p.purpose));
  });

  add('ポストフロップベット対象: 強いワンペアの重すぎるサイズを対象不一致にする',function(){
    const hr=regressionHand({
      heroHole:['As','Kd'],
      villainHole:['Qc','Jc'],
      board:['Kh','Th','9h'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:80,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:180
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.postflopBetPurposeProfile;
    const t=p&&p.targetPlan;
    return !!(p&&t&&p.lane==='protectionValue'&&t.severity==='bad'&&/弱い手が降り/.test(coachReviewText(ev)+t.text));
  });

  add('ポストフロップベット対象: セミブラフにフォールド対象と改善価値を持たせる',function(){
    const hr=regressionHand({
      heroHole:['Ah','Qh'],
      villainHole:['8c','8d'],
      board:['Jh','7h','2s'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:50,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:150
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.postflopBetPurposeProfile;
    const t=p&&p.targetPlan;
    return !!(p&&t&&p.lane==='semiBluff'&&t.severity==='good'&&/改善する価値/.test(coachReviewText(ev)+t.text)&&/Aハイ|弱いペア/.test(t.target));
  });

  add('ポストフロップブラフ候補: 強いドローは改善価値込みで候補にする',function(){
    const hr=regressionHand({
      heroHole:['Ah','Qh'],
      villainHole:['8c','8d'],
      board:['Jh','7h','2s'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:50,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:150
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const b=ev&&ev.postflopBetPurposeProfile&&ev.postflopBetPurposeProfile.bluffCandidate;
    return !!(b&&b.severity==='good'&&/強いドロー|セミブラフ/.test(b.kind+coachReviewText(ev))&&/改善/.test(b.policy));
  });

  add('ポストフロップブラフ候補: コール多め相手への空ブラフは候補不足にする',function(){
    const players=[
      regressionPlayer('あなた',true,['Qs','Js'],{chips:500}),
      regressionPlayer('yohe',false,['7h','7d'],{chips:500})
    ];
    const hr=regressionHand({
      players,
      board:['Ad','9c','3s'],
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:22,toCall:10,potOdds:10/32,facingRaise:true,position:'BB',playerName:'yohe',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'yohe',isHuman:false,playerIdx:1,playerChipsBefore:490}),
        regressionDecision({street:'flop',action:'bet',amount:70,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:485})
      ],
      pot:170
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.postflopBetPurposeProfile;
    const b=p&&p.bluffCandidate;
    return !!(b&&b.severity==='bad'&&p.severity==='bad'&&/コール多め|チェック/.test(coachReviewText(ev)+b.policy+b.suggest));
  });

  add('ポストフロップブラフ候補: マルチウェイの弱いブラフは頻度を落とす',function(){
    const players=[
      regressionPlayer('あなた',true,['Qs','Js'],{chips:500}),
      regressionPlayer('villain1',false,['7h','7d'],{chips:500}),
      regressionPlayer('villain2',false,['6c','6d'],{chips:500})
    ];
    const hr=regressionHand({
      players,
      board:['Ad','9c','3s'],
      decisions:[
        regressionDecision({street:'flop',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'villain1',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'MP',playerName:'villain2',isHuman:false,playerIdx:2,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'bet',amount:50,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:150
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const b=ev&&ev.postflopBetPurposeProfile&&ev.postflopBetPurposeProfile.bluffCandidate;
    return !!(b&&b.severity==='bad'&&/マルチウェイ|頻度/.test(coachReviewText(ev)+b.policy+b.summary));
  });

  add('ポストフロップベット対象: レンジCBは小さく広く打つ説明を持つ',function(){
    const hr=regressionHand({
      heroHole:['Kc','Qc'],
      villainHole:['7h','7d'],
      board:['Ad','9c','3s'],
      decisions:[
        regressionDecision({street:'preflop',action:'raise',amount:15,pot:7,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'preflop',action:'call',amount:10,pot:22,toCall:10,potOdds:10/32,facingRaise:true,position:'BB',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:490}),
        regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:485})
      ],
      pot:133
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.postflopBetPurposeProfile;
    const t=p&&p.targetPlan;
    return !!(p&&t&&p.lane==='rangeCbet'&&t.severity==='good'&&/小さく広く/.test(coachReviewText(ev)+t.text));
  });

  add('ポストフロップレイズ: 強いドローのチェックレイズをセミブラフ候補にする',function(){
    const hr=regressionHand({
      heroHole:['Ah','Kh'],
      villainHole:['7c','7d'],
      board:['Qh','8h','2c'],
      decisions:[
        regressionDecision({street:'flop',action:'check',amount:0,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'bet',amount:50,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'raise',amount:160,pot:150,toCall:50,potOdds:50/200,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:310
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='raise';});
    const p=ev&&ev.postflopRaisePlanProfile;
    return !!(p&&p.checkRaise&&p.strongDraw&&p.severity==='good'&&/セミブラフ/.test(coachReviewText(ev)+p.verdict+p.policy));
  });

  add('ポストフロップレイズ: 弱いワンペアのレイズしすぎを検出する',function(){
    const hr=regressionHand({
      heroHole:['7s','6s'],
      villainHole:['Ah','Kd'],
      board:['Kc','7d','2h'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:50,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'raise',amount:170,pot:150,toCall:50,potOdds:50/200,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:320
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='raise';});
    const p=ev&&ev.postflopRaisePlanProfile;
    return !!(p&&p.weakMade&&p.severity==='bad'&&ev.quality==='bad'&&/悪い手は降り/.test(coachReviewText(ev)+p.policy));
  });

  add('ポストフロップレイズ: 強い完成役は取り切りレイズにする',function(){
    const hr=regressionHand({
      heroHole:['8d','8s'],
      villainHole:['Ah','Kh'],
      board:['8h','7h','2c'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:60,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'raise',amount:190,pot:160,toCall:60,potOdds:60/220,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:350
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='raise';});
    const p=ev&&ev.postflopRaisePlanProfile;
    return !!(p&&p.strongMade&&p.severity==='good'&&ev.quality!=='bad'&&/下の完成役/.test(coachReviewText(ev)+p.target));
  });

  add('ポストフロップレイズ: 弱いドローのブラフレイズを条件不足にする',function(){
    const hr=regressionHand({
      heroHole:['Ah','5s'],
      villainHole:['Qc','Qs'],
      board:['Kd','4s','3c'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:70,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'raise',amount:220,pot:170,toCall:70,potOdds:70/240,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:390
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='raise';});
    const p=ev&&ev.postflopRaisePlanProfile;
    return !!(p&&(p.weakDraw||p.air)&&p.severity==='bad'&&/条件不足|強いドローを待つ/.test(coachReviewText(ev)+p.verdict+p.suggest));
  });

  add('ポストフロップレイズ: 評価JSONに専用プロファイルを保持する',function(){
    const hr=regressionHand({
      heroHole:['Ah','Kh'],
      villainHole:['7c','7d'],
      board:['Qh','8h','2c'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:50,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'raise',amount:160,pot:150,toCall:50,potOdds:50/200,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:310
    });
    const snap=evaluationSnapshot(hr,analyzeHand(hr));
    return !!(snap&&snap.evaluations&&snap.evaluations.some(function(e){return e.postflopRaisePlanProfile&&e.postflopRaisePlanProfile.axis==='ポストフロップのレイズ判断';}));
  });

  add('ベット説明: 対象レンジとサイズ理由を本文に統合する',function(){
    const hr=regressionHand({
      heroHole:['As','Kd'],
      villainHole:['Qc','Jc'],
      board:['Kh','Th','9h'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:80,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:180
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const txt=coachReviewText(ev);
    return !!(/コールしてほしい相手/.test(txt)&&/降ろしたい相手/.test(txt)&&/今回のサイズは80%pot/.test(txt)&&/弱い手が降り|強い手だけ/.test(txt)&&txt.length<420);
  });

  add('ベット説明: セミブラフはフォールド対象と改善価値を本文に出す',function(){
    const hr=regressionHand({
      heroHole:['Ah','Qh'],
      villainHole:['8c','8d'],
      board:['Jh','7h','2s'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:50,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:150
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&(e.action==='raise'||e.action==='bet');});
    const txt=coachReviewText(ev);
    return !!(/セミブラフ/.test(txt)&&/今すぐ降ろす価値/.test(txt)&&/改善する価値/.test(txt)&&/コールしてほしい相手/.test(txt));
  });

  add('ベット説明: リバーはバリューかブラフに絞って説明する',function(){
    const txt=naturalPostflopBetPurposeText({
      street:'river',
      postflopBetPurposeProfile:{
        street:'river',
        lane:'value',
        purpose:'強いバリュー',
        target:'下の完成役や強いワンペア',
        sizePct:75,
        recommendedPct:75,
        suggest:'推奨: バリュー継続',
        targetPlan:{target:'強いワンペア、2ペア、下の完成役',foldOut:'ほぼ不要。降ろすより払わせる場面',sizeFit:'中サイズで広く払わせる'}
      }
    });
    return !!(/リバーなので、考えることはバリューかブラフ/.test(txt)&&!/ドロー警戒|ドローが残/.test(txt));
  });

  add('ターン継続ベット: 強いドローの2発目を改善価値として肯定する',function(){
    const hr=regressionHand({
      heroHole:['Ah','Qh'],
      villainHole:['8c','8d'],
      board:['Jh','7h','2s','3c'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:50,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:50,pot:150,toCall:50,potOdds:50/200,facingRaise:true,position:'BB',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'turn',action:'bet',amount:100,pot:200,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:450})
      ],
      pot:300
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='turn'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.postflopBarrelPlanProfile;
    return !!(p&&p.lane==='barrel'&&p.severity==='good'&&/改善/.test(coachReviewText(ev)+p.policy));
  });

  add('ターン継続ベット: 完成カードで弱いペアの2発目を重く見る',function(){
    const hr=regressionHand({
      heroHole:['7s','6s'],
      villainHole:['Ah','Qh'],
      board:['Th','7d','2h','8h'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:50,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:50,pot:150,toCall:50,potOdds:50/200,facingRaise:true,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'turn',action:'bet',amount:130,pot:200,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:450})
      ],
      pot:330
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='turn'&&(e.action==='raise'||e.action==='bet');});
    const p=ev&&ev.postflopBarrelPlanProfile;
    return !!(p&&p.lane==='barrel'&&p.completed&&p.severity==='bad'&&ev.quality==='bad'&&/完成/.test(coachReviewText(ev)+p.policy));
  });

  add('ターン継続ベット: 完成カードで弱い手を止めるチェックを肯定する',function(){
    const hr=regressionHand({
      heroHole:['7s','6s'],
      villainHole:['Ah','Qh'],
      board:['Th','7d','2h','8h'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:50,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:50,pot:150,toCall:50,potOdds:50/200,facingRaise:true,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'turn',action:'check',amount:0,pot:200,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:450})
      ],
      pot:200
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='turn'&&e.action==='check';});
    const p=ev&&ev.postflopBarrelPlanProfile;
    const snap=evaluationSnapshot(hr,analyzeHand(hr));
    const se=snap&&snap.evaluations&&snap.evaluations.find(function(e){return e.street==='turn'&&e.action==='check';});
    return !!(p&&p.lane==='check'&&p.completed&&p.severity==='good'&&ev.quality!=='bad'&&se&&se.postflopBarrelPlanProfile);
  });

  add('ポストフロップ受け方: 弱いドローの大きいコールを受けすぎにする',function(){
    const hr=regressionHand({
      heroHole:['Ah','5s'],
      villainHole:['Qc','Qs'],
      board:['Kd','4s','3c'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:70,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:70,pot:170,toCall:70,potOdds:70/240,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:240
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='call';});
    const p=ev&&ev.postflopDefensePlanProfile;
    return !!(p&&p.lane==='call'&&p.weakDraw&&p.severity==='bad'&&ev.quality==='bad'&&/弱いドロー/.test(coachReviewText(ev)+p.policy));
  });

  add('ポストフロップ受け方: 安い強ドローのフォールドを降りすぎにする',function(){
    const hr=regressionHand({
      heroHole:['Ah','Qh'],
      villainHole:['8c','8d'],
      board:['Jh','7h','2s'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'fold',amount:0,pot:133,toCall:33,potOdds:33/166,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:133
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='fold';});
    const p=ev&&ev.postflopDefensePlanProfile;
    return !!(p&&p.lane==='fold'&&p.strongDraw&&p.severity==='bad'&&ev.quality==='bad'&&/強いドロー/.test(coachReviewText(ev)+p.policy));
  });

  add('ポストフロップ受け方: 完成カードで弱い手をフォールドできる',function(){
    const hr=regressionHand({
      heroHole:['7s','6s'],
      villainHole:['Ah','Qh'],
      board:['Th','7d','2h','8h'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:50,pot:100,toCall:0,facingRaise:false,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:50,pot:150,toCall:50,potOdds:50/200,facingRaise:true,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'turn',action:'bet',amount:130,pot:200,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:450}),
        regressionDecision({street:'turn',action:'fold',amount:0,pot:330,toCall:130,potOdds:130/460,facingRaise:true,position:'CO',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:450})
      ],
      pot:330
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='turn'&&e.action==='fold';});
    const p=ev&&ev.postflopDefensePlanProfile;
    const snap=evaluationSnapshot(hr,an);
    const se=snap&&snap.evaluations&&snap.evaluations.find(function(e){return e.street==='turn'&&e.action==='fold';});
    return !!(p&&p.lane==='fold'&&p.completed&&p.severity==='good'&&ev.quality!=='bad'&&se&&se.postflopDefensePlanProfile);
  });

  add('コール後計画: 弱いドローのコールは次ストリートで苦しいと説明する',function(){
    const hr=regressionHand({
      heroHole:['Ah','5s'],
      villainHole:['Qc','Qs'],
      board:['Kd','4s','3c'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:70,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:70,pot:170,toCall:70,potOdds:70/240,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:240
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='call';});
    const p=ev&&ev.postflopCallFuturePlanProfile;
    const txt=coachReviewText(ev);
    return !!(p&&p.weakDraw&&p.severity==='bad'&&/次ストリート|次に/.test(txt)&&/フォールド寄り|苦しく/.test(txt+p.policy+p.suggest));
  });

  add('コール後計画: 強いドローは改善カードと外れた時を分ける',function(){
    const hr=regressionHand({
      heroHole:['Ah','Qh'],
      villainHole:['8c','8d'],
      board:['Jh','7h','2s'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:33,pot:133,toCall:33,potOdds:33/166,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:166
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='call';});
    const p=ev&&ev.postflopCallFuturePlanProfile;
    const snap=evaluationSnapshot(hr,analyzeHand(hr));
    const se=snap&&snap.evaluations&&snap.evaluations.find(function(e){return e.street==='flop'&&e.action==='call';});
    return !!(p&&p.strongDraw&&p.severity==='good'&&/改善カード/.test(p.suggest+p.policy)&&se&&se.postflopCallFuturePlanProfile);
  });

  add('コール後計画: ワンペアの重いコールは嫌なカードを説明する',function(){
    const hr=regressionHand({
      heroHole:['Js','9d'],
      villainHole:['Ah','Jh'],
      board:['Qh','9h','8c'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:70,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'flop',action:'call',amount:70,pot:170,toCall:70,potOdds:70/240,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:240
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='call';});
    const p=ev&&ev.postflopCallFuturePlanProfile;
    const txt=coachReviewText(ev);
    return !!(p&&p.hasPair&&p.severity==='bad'&&/嫌なカード/.test(txt+p.plan)&&/同スート完成|連結完成/.test(p.plan));
  });

  add('受け側説明: リバーコールは必要勝率とブラフ量を本文に出す',function(){
    const txt=coachReviewText({
      street:'river',
      action:'call',
      quality:'bad',
      liveCashRiverDecisionProfile:{
        lane:'riverOnePairCatch',
        sizePct:75,
        completed:true,
        pressure:2,
        policy:'リバーのワンペアは相手のサイズとラインにブラフが残るかで判断します。',
        risk:'75%pot / 完成寄りボード / 相手圧力2回 / ライン=ターン・リバー連続ベット',
        suggest:'推奨: フォールド寄り',
        line:{label:'ターン・リバー連続ベット'},
        opponentTendency:{label:'ブラフ不足'}
      }
    });
    return !!(/必要勝率は約30%/.test(txt)&&/ブラフ/.test(txt)&&/ワンペア/.test(txt)&&/ターンとリバー/.test(txt));
  });

  add('受け側説明: フロップ/ターンのコールは勝っている想定を本文に出す',function(){
    const txt=coachReviewText({
      street:'flop',
      action:'call',
      quality:'bad',
      postflopDefensePlanProfile:{
        lane:'call',
        sizePct:70,
        target:'相手のCB、薄いバリュー、一部ブラフ',
        weakMade:true,
        completed:true,
        pressure:1,
        suggest:'推奨: フォールド寄り'
      },
      postflopCallFuturePlanProfile:{
        plan:'次の良いカード: 安全なブランク。嫌なカード: 同スート完成・連結完成。',
        policy:'ワンペアのコールは次に嫌なカードが落ちた時を考えます。',
        suggest:'次ストリートの大きい圧力には降りる準備'
      }
    });
    return !!(/必要勝率/.test(txt)&&/続ける根拠/.test(txt)&&/相手のCB/.test(txt)&&/嫌なカード/.test(txt));
  });

  add('コーチ文: レンジ更新を口語で説明する',function(){
    const ev={
      street:'river',
      action:'call',
      quality:'ok',
      boardTextureProfile:{dynamic:true,flushThreat:true},
      rangeActionUpdateProfile:{lane:'call',sizePct:70,rangeState:'pressure_dense',pressure:3,severity:'border'}
    };
    const txt=naturalRangeActionUpdateText(ev);
    return /複数ストリート/.test(txt)&&/ブラフ不足/.test(txt)&&/70%pot/.test(txt)&&/境界/.test(txt);
  });

  add('リバー文言: 未確定ドローが残ると言わない',function(){
    const board=boardTextureProfile(regressionCards(['Th','9h','4d','8c','2s']),'river',regressionCards(['Th','9h','4d','8c']));
    const boardText=boardTextureProfileText(board);
    const ev={
      street:'river',
      action:'bet',
      quality:'border',
      boardTextureProfile:board,
      rangeActionUpdateProfile:{street:'river',lane:'bet',sizePct:56,rangeState:'pressure_dense',pressure:2,severity:'border'}
    };
    const coach=naturalRangeActionUpdateText(ev)+' '+gtoRangeUpdateText(ev)+' '+boardText;
    return !/強いドロー|強ドロー|ドローが残る|強いフラッシュドロー/.test(coach)&&/完成役|ブラフ候補|空振り|ストレート完成レンジ/.test(coach);
  });

  add('コーチ文: 完成寄りボードの意味を説明する',function(){
    const txt=naturalBoardTextureDefinitionText({boardTextureProfile:{dynamic:true,straightThreat:true}});
    return /完成寄り\/動的ボード/.test(txt)&&/フラッシュ・ストレート・フルハウス/.test(txt)&&/ワンペア/.test(txt);
  });

  add('コーチ文: プリフロップ非BBフラットを短く説明する',function(){
    const txt=coachReviewText({
      street:'preflop',
      action:'call',
      quality:'bad',
      suggest:'推奨: フォールド',
      strategyMix:'Fold 75-100% / Call 0-25%',
      comment:'【初心者リーク】KJoのCOコールドコール。参照レンジでは Fold 75-100% / Call 0-25%。非BBのコールはポジション・後続プレイヤー・ドミネートリスクの影響が大きい。',
      liveCashSpotProfile:{label:'IP flat',lane:'flat',policy:'参照レンジ: IP flat, out GTO基準はFold 75-100% / Call 0-25%',risk:'OOP・ドミネートリスク'}
    });
    return /フォールド寄り/.test(txt)&&/非BBでレイズにコール/.test(txt)&&/頻度の目安/.test(txt)&&!/IP flat|GTO基準|out/.test(txt)&&txt.length<260;
  });

  add('コーチ文: 正しいフォールドを重複させない',function(){
    const txt=coachReviewText({
      street:'preflop',
      action:'fold',
      quality:'good',
      comment:'正解。96oのCOレイズへのフォールド。コールレンジ外の弱いハンドです。',
      liveCashSpotProfile:{label:'対レイズフォールド',lane:'vsRaiseFold',policy:'コールレンジ外です。',risk:'逆インプライドオッズ'}
    });
    const count=(txt.match(/フォールド/g)||[]).length;
    return /良い判断/.test(txt)&&count<=2&&!/フォールド継続|フォールドはこのまま/.test(txt);
  });

  add('コーチ文: 判断の入口をアクション名で自然に始める',function(){
    const txt=coachReviewText({
      street:'flop',
      action:'check',
      quality:'good',
      comment:'チェック。',
      onePairProfile:{weakPair:true,policy:'弱いワンペアはショーダウン価値を守ります。',risk:'SPR約10 / 比較的静的なボード / 圧力0段階'}
    });
    return /^チェックで問題ありません。/.test(txt)&&!/この判断で大丈夫です/.test(txt);
  });

  add('コーチ文: 混合ライン説明を短く自然にする',function(){
    const txt=coachReviewText({
      street:'turn',
      action:'check',
      quality:'ok',
      isMix:true,
      freqPct:55,
      comment:'チェック。',
      suggest:'ベットするならポットの50% (20T)'
    });
    return /複数のラインが成立します/.test(txt)&&/チェックで/.test(txt)&&/ベット/.test(txt)&&/頻度感/.test(txt)&&!/この局面では/.test(txt);
  });

  add('コーチ文: リバーチェックの内部圧力ラベルを出さない',function(){
    const txt=coachReviewText({
      street:'river',
      action:'check',
      quality:'good',
      comment:'チェック。',
      liveCashRiverDecisionProfile:{
        lane:'riverStrongCheck',
        policy:'強い手は基本的にリバーでバリューを取りに行きますが、非ナッツや相手が打つレンジを持つ時はチェックも混ざります。',
        risk:'チェック / 非ナッツ強手 / 相手圧力0回'
      }
    });
    return /強い圧力はまだ入っていません/.test(txt)&&!/相手圧力0回|相手傾向=|チェックはこのままで問題ありません/.test(txt);
  });

  add('リングリバー: 非ナッツで相手ベットへ大きくレイズしすぎない',function(){
    const hr=regressionHand({
      heroHole:['4c','2c'],
      villainHole:['As','Kd'],
      board:['Js','8c','Qh','6c','Jc'],
      decisions:[
        regressionDecision({street:'river',action:'bet',amount:30,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'river',action:'raise',amount:150,pot:130,toCall:30,potOdds:30/160,facingRaise:true,position:'BB',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:280
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='river'&&e.action==='raise';});
    const txt=ev?coachReviewText(ev):'';
    return !!(ev&&ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.lane==='riverHeroRaise'&&ev.liveCashRiverDecisionProfile.severity==='bad'&&ev.quality==='bad'&&/相手のベットにこちらがレイズ/.test(txt)&&!/ライン=/.test(txt));
  });

  add('リングリバー: ナッツ級は相手ベットへレイズで取り切る候補にする',function(){
    const hr=regressionHand({
      heroHole:['Ac','Kc'],
      villainHole:['Qs','Qd'],
      board:['Qc','8c','2c','7d','3h'],
      decisions:[
        regressionDecision({street:'river',action:'bet',amount:300,pot:1000,toCall:0,facingRaise:false,position:'BB',playerName:'villain',isHuman:false,playerIdx:1,playerChipsBefore:900}),
        regressionDecision({street:'river',action:'raise',amount:900,pot:1300,toCall:300,potOdds:300/1600,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:1200})
      ],
      pot:2200
    });
    const an=analyzeHand(hr);
    const ev=humanEval(an,function(e){return e.street==='river'&&e.action==='raise';});
    return !!(ev&&ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.lane==='riverHeroRaise'&&ev.liveCashRiverDecisionProfile.severity==='good'&&ev.quality==='good'&&/相手レンジはかなり強く/.test(coachReviewText(ev)));
  });

  add('リバーレイズ説明: 非ナッツはコールされる相手と降ろしたい相手を本文に出す',function(){
    const txt=coachReviewText({
      street:'river',
      action:'raise',
      quality:'bad',
      liveCashRiverDecisionProfile:{
        lane:'riverHeroRaise',
        sizePct:125,
        completed:true,
        heroRaise:{classLabel:'非ナッツフラッシュ',severity:'bad'},
        severity:'bad',
        policy:'非ナッツはコール止めを優先します。',
        risk:'125%pot / 完成寄りボード / ライン=リバーでこちらがレイズ',
        suggest:'推奨: コール止め'
      }
    });
    return !!(/コールされる相手/.test(txt)&&/降ろしたい相手/.test(txt)&&/非ナッツ/.test(txt));
  });

  add('リバーレイズ説明: ナッツ級は取り切り対象を本文に出す',function(){
    const txt=coachReviewText({
      street:'river',
      action:'raise',
      quality:'good',
      liveCashRiverDecisionProfile:{
        lane:'riverHeroRaise',
        sizePct:90,
        completed:false,
        heroRaise:{classLabel:'ナッツ級',severity:'good'},
        severity:'good',
        policy:'レイズで取り切ります。',
        risk:'90%pot / 比較的静的なボード / ライン=リバーでこちらがレイズ',
        suggest:'推奨: レイズ'
      }
    });
    return !!(/コールしてほしい相手/.test(txt)&&/取り切り/.test(txt)&&/相手レンジはかなり強く/.test(txt));
  });

  add('リバーベット設計: 薄バリューは対象レンジとサイズ帯を保持する',function(){
    const hr=regressionHand({
      heroHole:['Ks','Qd'],
      villainHole:['7c','7d'],
      board:['Kc','7s','2d','4h','9c'],
      decisions:[
        regressionDecision({street:'river',action:'bet',amount:35,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:135
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='bet';});
    const txt=ev?coachReviewText(ev):'';
    return !!(ev&&ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.betDesign&&ev.liveCashRiverDecisionProfile.betDesign.plan==='thinValue'&&/コールしてほしい相手/.test(txt)&&/サイズ帯/.test(txt));
  });

  add('リバーベット設計: ブラフは降ろしたい相手とブロッカー条件を持つ',function(){
    const profile={
      lane:'riverBluffCandidate',
      sizePct:55,
      completed:true,
      betDesign:{
        plan:'bluff',
        target:'基本はなし。コールされたらほぼ負ける想定',
        foldOut:'弱いワンペア、Aハイ、空振りドローの一部',
        sizeBand:'チェック寄り。打つなら40〜60%pot',
        warning:'リバーブラフはドロー警戒ではなく、相手に降りる手が残っているかとブロッカーで作ります。'
      },
      severity:'bad',
      policy:'ブラフ条件が薄い場面です。',
      risk:'55%pot / 完成寄りボード',
      suggest:'推奨: チェック'
    };
    const txt=coachReviewText({
      street:'river',
      action:'bet',
      quality:'bad',
      liveCashRiverDecisionProfile:profile
    });
    const d=profile.betDesign;
    return !!(txt&&d.plan==='bluff'&&d.target&&d.foldOut&&d.sizeBand&&d.warning);
  });

  add('リバーレイズ設計: 非ナッツレイズは小さめまたはコール止めを示す',function(){
    const txt=coachReviewText({
      street:'river',
      action:'raise',
      quality:'bad',
      liveCashRiverDecisionProfile:{
        lane:'riverHeroRaise',
        sizePct:125,
        completed:true,
        heroRaise:{classLabel:'非ナッツフラッシュ',severity:'bad'},
        betDesign:{plan:'raiseCaution',target:'かなり限られた下の完成役',foldOut:'薄いワンペアや空振り',sizeBand:'コール止め、または小さめレイズだけ',warning:'非ナッツのリバーレイズは危険です。'},
        severity:'bad',
        policy:'非ナッツはコール止めを優先します。',
        risk:'125%pot / 完成寄りボード',
        suggest:'推奨: コール止め'
      }
    });
    return !!(/コール止め/.test(txt)&&/小さめレイズ/.test(txt)&&/降ろしたい相手/.test(txt));
  });

  add('リングリバー相手傾向: ブラフ不足タイプのリバーベットへワンペア受けを締める',function(){
    const players=[
      regressionPlayer('あなた',true,['Ks','Qs'],{chips:500}),
      regressionPlayer('bitts',false,['Ad','Td'],{chips:500,profile:AI_PROFILES.bitts})
    ];
    const hr=regressionHand({
      players:players,
      board:['Kd','8s','2c','4h','9d'],
      decisions:[
        regressionDecision({street:'river',action:'bet',amount:40,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'bitts',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'river',action:'call',amount:40,pot:140,toCall:40,potOdds:40/180,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:180
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    const txt=ev?coachReviewText(ev):'';
    return !!(ev&&ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.opponentTendency&&ev.liveCashRiverDecisionProfile.opponentTendency.label==='ブラフ不足'&&ev.liveCashRiverDecisionProfile.severity==='bad'&&/ブラフ不足/.test(txt));
  });

  add('リングリバー相手傾向: ブラフ多めタイプには境界コールを戻す',function(){
    const players=[
      regressionPlayer('あなた',true,['Ks','Qs'],{chips:500}),
      regressionPlayer('nt',false,['Ad','Td'],{chips:500,profile:AI_PROFILES.nt})
    ];
    const hr=regressionHand({
      players:players,
      board:['Kd','8s','2c','4h','9d'],
      decisions:[
        regressionDecision({street:'river',action:'bet',amount:65,pot:100,toCall:0,facingRaise:false,position:'BB',playerName:'nt',isHuman:false,playerIdx:1,playerChipsBefore:500}),
        regressionDecision({street:'river',action:'call',amount:65,pot:165,toCall:65,potOdds:65/230,facingRaise:true,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:230
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='call';});
    return !!(ev&&ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.opponentTendency&&ev.liveCashRiverDecisionProfile.opponentTendency.label==='ブラフ多め'&&ev.liveCashRiverDecisionProfile.severity==='border'&&ev.quality!=='bad');
  });

  add('リングリバー相手傾向: コール多め相手への空振りブラフを抑える',function(){
    const players=[
      regressionPlayer('あなた',true,['As','Qd'],{chips:500}),
      regressionPlayer('yu',false,['7c','7d'],{chips:500,profile:AI_PROFILES.yu})
    ];
    const hr=regressionHand({
      players:players,
      board:['Kc','7s','2d','4h','9c'],
      decisions:[
        regressionDecision({street:'river',action:'bet',amount:60,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:160
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='river'&&e.action==='bet';});
    const txt=ev?coachReviewText(ev):'';
    return !!(ev&&ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.opponentTendency&&ev.liveCashRiverDecisionProfile.opponentTendency.label==='コール多め'&&ev.liveCashRiverDecisionProfile.severity==='bad'&&/コール多め/.test(txt));
  });

  add('ポストフロップ相手タイプ: コール多め相手への空ブラフを抑える',function(){
    const players=[
      regressionPlayer('あなた',true,['As','Qd'],{chips:500}),
      regressionPlayer('yu',false,['7c','7d'],{chips:500,profile:AI_PROFILES.yu})
    ];
    const hr=regressionHand({
      players:players,
      board:['Kc','7s','2d'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:35,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:135
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='bet';});
    const txt=ev?coachReviewText(ev):'';
    return !!(ev&&ev.postflopBetPurposeProfile&&ev.postflopBetPurposeProfile.opponentType&&ev.postflopBetPurposeProfile.opponentType.label==='コール多め'&&ev.postflopBetPurposeProfile.severity==='bad'&&/コール多め/.test(txt));
  });

  add('ポストフロップ相手タイプ: コール多め相手には薄いバリューを許容する',function(){
    const players=[
      regressionPlayer('あなた',true,['Ks','Qd'],{chips:500}),
      regressionPlayer('yu',false,['7c','7d'],{chips:500,profile:AI_PROFILES.yu})
    ];
    const hr=regressionHand({
      players:players,
      board:['Kc','7s','2d'],
      decisions:[
        regressionDecision({street:'flop',action:'bet',amount:33,pot:100,toCall:0,facingRaise:false,position:'BTN',playerName:'あなた',isHuman:true,playerIdx:0,playerChipsBefore:500})
      ],
      pot:133
    });
    const ev=humanEval(analyzeHand(hr),function(e){return e.street==='flop'&&e.action==='bet';});
    const txt=ev?coachReviewText(ev):'';
    return !!(ev&&ev.postflopBetPurposeProfile&&ev.postflopBetPurposeProfile.opponentType&&ev.postflopBetPurposeProfile.opponentType.label==='コール多め'&&ev.postflopBetPurposeProfile.severity!=='bad'&&/薄いバリュー|コール多め/.test(txt));
  });

  const results=tests.map(function(t){
    try{return{name:t.name,pass:!!t.fn()};}
    catch(e){return{name:t.name,pass:false,error:e&&e.message?e.message:String(e)};}
  });
  const passed=results.filter(r=>r.pass).length;
  const summary={passed:passed,total:results.length,ok:passed===results.length,results:results};
  console.table(results);
  return summary;
}
function fishTankRegressionReportText(summary){
  const lines=['Fish Tank 回帰検査: '+summary.passed+'/'+summary.total+' PASS'];
  summary.results.forEach(function(r){lines.push((r.pass?'✓ ':'✗ ')+r.name+(r.error?' — '+r.error:''));});
  return lines.join('\n');
}

// [Codex fix 2026-06-05] 監査付き大量プレーテスト。実ハンド混入・文脈ズレ・評価矛盾を機械的に拾う。
function auditAutoDecision(player,game){
  let d=null;
  try{d=aiDecide(player,game,game.aiLevel||'medium');}catch(e){d=null;}
  const toCall=Math.max(0,game.currentBet-player.currentBet);
  if(!d||!d.action){
    if(toCall>0)d={action:toCall>=player.chips?'call':'call'};
    else d={action:'check'};
  }
  if(d.action==='bet')d.action='raise';
  if(d.action==='raise'&&(!isFinite(d.amount)||d.amount<=player.currentBet)){
    d.amount=Math.min(player.chips+player.currentBet,Math.max(game.currentBet+game.minRaise,game.bb*2));
  }
  if(d.action==='allin')d.amount=player.chips+player.currentBet;
  return d;
}
function playAuditGame(g,maxActions){
  maxActions=maxActions||90;
  let guard=0,timeout=false;
  while(g&&g.street!=='showdown'&&!g.gameOver&&guard<maxActions){
    guard++;
    if(g.actionIdx==null||g.actionIdx<0){
      if(g.street!=='showdown')g._check();
      if(g.actionIdx==null||g.actionIdx<0){
        timeout=g.street!=='showdown';
        break;
      }
      continue;
    }
    const p=g.players[g.actionIdx];
    if(!p||!p.active||p.folded||p.allIn){g._check();continue;}
    const d=auditAutoDecision(p,g);
    g.processAction(g.actionIdx,d.action,d.amount||0);
  }
  if(g&&g.street!=='showdown'&&guard>=maxActions)timeout=true;
  const hr=g&&g.handHistory&&g.handHistory[0]?g.handHistory[0]:null;
  if(hr&&timeout)hr.auditTimeout=true;
  return hr;
}
function createAuditRingGame(){
  const g=new GameEngine({numPlayers:6,sb:2,bb:5,startingChips:500,aiLevel:'hard'});
  g.startHand();
  return g;
}
function createAuditTournamentGame(focusId){
  const focus=TOURNAMENT_FOCUS_PRESETS[focusId]||TOURNAMENT_FOCUS_PRESETS.general;
  const presetId=focus.preset||'middle';
  const ctx=applyTournamentFocus(cloneTournamentPreset(presetId),focusId);
  const g=new GameEngine({numPlayers:ctx.players||8,sb:ctx.sb,bb:ctx.bb,startingChips:ctx.bb*(ctx.stackBB||25),aiLevel:'hard',tournamentContext:ctx});
  g.startHand();
  return g;
}
function createAuditScenarioGame(){
  const g=new GameEngine({numPlayers:6,sb:2,bb:5,startingChips:500,aiLevel:'hard'});
  g.startHand();
  g.players.forEach(function(p){
    (p.holeCards||[]).forEach(function(c){g.deck.cards.push(c);});
    p.holeCards=[];
    p.chips+=p.totalInvested||0;
    p.totalInvested=0;p.currentBet=0;p.folded=false;p.allIn=false;
  });
  g.pot=0;g.currentBet=0;g.minRaise=g.bb;g.currentHandDecisions=[];
  const baseChips=g.players.map(function(p){return p.chips;});
  let q=null;
  for(let i=0;i<16;i++){
    _resetScenarioAttemptState(g,baseChips);
    const sc=_genScenarioFlop(g.deck.cards,_pickScenarioCat());
    g._scenario=sc;
    _buildAndApplyPreflopStory(g);
    g.street='flop';
    g.community=sc.flopCards.slice();
    g.currentBet=0;g.minRaise=g.bb;
    g.players.forEach(function(p){p.currentBet=0;p.allIn=false;});
    g._setOrder();
    q=trainingSpotQualityAudit(g,{mode:'scenario'});
    if(q.ok)break;
  }
  g._scenarioQuality=q;
  return g;
}
function addAuditIssue(list,severity,type,text,meta){
  list.push({severity:severity,type:type,text:text,meta:meta||null});
}
function auditIssuesForHand(hr,an,label){
  const issues=[];
  if(!hr){addAuditIssue(issues,'critical','no-hand','ハンド履歴が生成されませんでした。');return issues;}
  if(hr.auditTimeout)addAuditIssue(issues,'critical','timeout','自動プレーが規定アクション数内に完了しませんでした。');
  if(!an){addAuditIssue(issues,'critical','no-analysis','分析結果が生成されませんでした。');return issues;}
  const leak=an.actualHandAudit||null;
  if(leak&&leak.status==='FAIL'){
    addAuditIssue(issues,'critical','hidden-hand-leak','実ハンド混入監査がFAILです。リザルト/AIコピー/評価スナップショットに相手実ハンド由来の情報が混ざる危険があります。',leak);
  }else if(leak&&leak.status==='WARN'){
    addAuditIssue(issues,'high','hidden-hand-warn','実ハンド混入監査がWARNです。コメントやスナップショットを確認してください。',leak);
  }
  const q=hr.scenarioQuality||null;
  if(q&&(!q.ok||q.score<70))addAuditIssue(issues,'high','scenario-quality','フロップ練習シナリオの品質が低く、練習として成立しにくい可能性があります。',q);
  else if(q&&q.score<82)addAuditIssue(issues,'medium','scenario-quality','フロップ練習シナリオに軽い違和感があります。',q);
  const premise=an.premiseAudit||null;
  if(premise&&premise.issues&&premise.issues.length){
    // [Codex fix 2026-06-25] AIのレンジ違和感と、出題/文脈そのものの破綻を分ける。
    const hardPremiseIssues=premise.issues.filter(function(x){return !/^AI前提/.test((x&&x.text)||'');});
    const aiPremiseIssues=premise.issues.filter(function(x){return /^AI前提/.test((x&&x.text)||'');});
    if(hardPremiseIssues.length)addAuditIssue(issues,'high','premise-context','プリフロップ文脈認識に問題があります。3BET/4BET、リンプ→アイソ、BBディフェンス等の名前付けを確認してください。',hardPremiseIssues);
    if(aiPremiseIssues.length)addAuditIssue(issues,'medium','ai-preflop-premise','AIのプリフロップ参加レンジに違和感があります。出題前提の破綻ではなく、AIレンジ/サイズの調整候補です。',aiPremiseIssues);
  }
  if(premise&&premise.warnings&&premise.warnings.length){
    // [Codex fix 2026-06-26] 混合候補だけのAI境界スポットは監査ノイズにしない。明確なbad警告だけ確認候補に上げる。
    const hardWarnings=premise.warnings.filter(function(x){return x&&x.profile&&x.profile.severity==='bad';});
    if(hardWarnings.length)addAuditIssue(issues,'medium','premise-warning','プリフロップ文脈認識に警告があります。',hardWarnings);
  }
  (an.evals||[]).forEach(function(e){
    const c=(e.comment||'').replace(/<[^>]+>/g,'');
    // [Codex fix 2026-06-21] 実地検査では、評価の正誤だけでなく「読める説明か」も監査する。
    const coach=(e.coachComment||coachReviewText(e)||'').replace(/<[^>]+>/g,'').replace(/\s+/g,' ').trim();
    const dec=e.deduction||0;
    const street=(e.street||'?').toUpperCase();
    const action=e.action||'?';
    // [Codex fix 2026-06-27] 大減点そのものではなく、大減点なのに理由が薄いケースだけ拾う。
    const clearLargeDeductionReason=/必要勝率|実効エクイティ|EVを逃|大幅EV損失|期待値損失|ワンペア監査|FTポストフロップ|ベット目的|サイズ|圧力|レンジ|フォールドが勝ち/.test(c+' '+coach);
    if(e.quality==='bad'&&dec>=25&&(!clearLargeDeductionReason||(coach.length<70&&c.length<180))){
      addAuditIssue(issues,'high','large-deduction',street+' '+action+' に大きな減点があります。理由の説明量が足りるか確認対象です。',{deduction:dec,comment:c,coachComment:coach});
    }
    if(/正解|明確なコール|合理的|許容範囲/.test(c)&&(e.quality==='bad'||dec>=10)){
      addAuditIssue(issues,'high','comment-deduction-contradiction',street+' '+action+' はコメントが肯定的なのに減点が大きく、説明と採点が矛盾しています。',{deduction:dec,quality:e.quality,comment:c});
    }
    if(e.onePairProfile&&e.onePairProfile.verdict==='bad'&&/明確なコール|EV優位/.test(c)){
      addAuditIssue(issues,'high','one-pair-call-contradiction',street+' '+action+' はワンペア警戒プロファイルと「明確コール」コメントが衝突しています。',{onePairProfile:e.onePairProfile,comment:c});
    }
    if(e.finalTableLearningPoint&&e.finalTableLearningPoint.severity==='bad'&&e.quality==='good'){
      addAuditIssue(issues,'high','ft-learning-contradiction',street+' '+action+' はFT学習テーマが危険扱いなのに、評価が良判定になっています。',{finalTableLearningPoint:e.finalTableLearningPoint,comment:c});
    }
    if(e.finalTablePostflopProfile&&e.finalTablePostflopProfile.severity==='bad'&&!e.finalTableLearningPoint){
      addAuditIssue(issues,'medium','ft-learning-missing',street+' '+action+' はFTポストフロップで危険扱いなのに、利用者向け学習テーマに集約されていません。',{finalTablePostflopProfile:e.finalTablePostflopProfile,comment:c});
    }
    if(e.finalTableRangeProfile&&e.finalTableRangeProfile.severity==='bad'&&e.action!=='fold'&&!e.finalTableLearningPoint){
      addAuditIssue(issues,'medium','ft-learning-missing',street+' '+action+' はFTレンジ表で危険扱いなのに、利用者向け学習テーマに集約されていません。',{finalTableRangeProfile:e.finalTableRangeProfile,comment:c});
    }
    if(e.street==='flop'&&e.action==='check'&&e.donkProfile&&e.donkProfile.severity==='good'&&dec>=8){
      addAuditIssue(issues,'medium','donk-check-weight','OOPチェックが自然なドンク抑制局面なのに減点が残っています。',{deduction:dec,donkProfile:e.donkProfile});
    }
    if(e.rawEqPct!=null&&e.effectiveEqPct!=null&&Math.abs(e.rawEqPct-e.effectiveEqPct)>=35){
      // [Codex fix 2026-06-25] 差が大きいだけでは監査対象にしない。生EQと実効EQの落差を本文で説明できていれば合格。
      const gapText=(c+' '+coach+' '+(e.suggest||'')).replace(/\s+/g,' ');
      const explainsGap=/生のエクイティ|Raw EQ|生EQ/.test(gapText)&&/実効エクイティ|実効EQ/.test(gapText)&&/必要|届かず|足り/.test(gapText);
      if(!explainsGap)addAuditIssue(issues,'medium','raw-effective-gap',street+' '+action+' はRaw EQと実効EQの差が大きい局面です。Raw EQ偏重コメントになっていないか確認してください。',{rawEqPct:e.rawEqPct,effectiveEqPct:e.effectiveEqPct});
    }
    if(e.street==='river'&&e.action==='call'&&/(トップペア|ワンペア)/.test(c)&&!/ツーペア|トリップス|フルハウス|クアッズ|フォーカード/.test(c)&&/明確なコール/.test(c)&&!e.onePairProfile){
      addAuditIssue(issues,'medium','river-one-pair-missing-profile','リバーのワンペアコールに専用プロファイルが付いていません。完成ボード/ライブ$2/$5補正の監査対象です。',{comment:c});
    }
    if(coach&&coach.length>420){
      addAuditIssue(issues,'medium','review-too-long',street+' '+action+' のレビュー文が長く、初心者が要点を追いにくい可能性があります。',{length:coach.length,text:coach});
    }
    if(e.postflopBetPurposeProfile&&e.postflopBetPurposeProfile.bluffCandidate&&coach.length>360){
      addAuditIssue(issues,'medium','bluff-comment-too-long',street+' '+action+' のブラフ候補説明が長く、目的・候補・サイズのどれを直すべきか曖昧になる可能性があります。',{length:coach.length,bluffCandidate:e.postflopBetPurposeProfile.bluffCandidate,text:coach});
    }
    ['コールしてほしい相手','降ろしたい相手','ブラフ候補として見ると','推奨:'].forEach(function(phrase){
      const n=(coach.match(new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'g'))||[]).length;
      if(n>=3){
        addAuditIssue(issues,'low','review-duplicate-phrase',street+' '+action+' のレビュー文で「'+phrase+'」が繰り返されすぎています。',{phrase:phrase,count:n,text:coach});
      }
    });
  });
  return issues;
}
function compactAuditHand(hr,an,modeLabel,issues,modeId,sampleIndex){
  const human=hr&&hr.players?hr.players.find(function(p){return p.isHuman;}):null;
  return{
    mode:modeLabel,
    modeId:modeId||'',
    sampleIndex:sampleIndex||0,
    handNum:hr?hr.handNum:null,
    score:an?an.score:null,
    grade:an?an.grade:null,
    hero:human&&human.holeCards?human.holeCards.map(function(c){return c.rank+c.suit;}).join(' '):'',
    board:hr&&hr.community?hr.community.map(function(c){return c.rank+c.suit;}).join(' '):'',
    issues:issues,
    snapshot:hr?evaluationSnapshot(hr,an):null
  };
}
function auditIssuePriorityWeight(issue){
  const sev={critical:400,high:250,medium:120,low:40}[issue&&issue.severity]||40;
  const type={
    'hidden-hand-leak':180,
    'exception':170,
    'timeout':160,
    'premise-context':145,
    'ai-preflop-premise':82,
    'comment-deduction-contradiction':130,
    'one-pair-call-contradiction':120,
    'ft-learning-contradiction':118,
    'ft-learning-missing':92,
    'scenario-quality':95,
    'large-deduction':80,
    'donk-check-weight':70,
    'river-one-pair-missing-profile':65,
    'review-too-long':60,
    'bluff-comment-too-long':58,
    'review-duplicate-phrase':35,
    'raw-effective-gap':45
  }[issue&&issue.type]||30;
  return sev+type;
}
function auditRepairSuggestion(type){
  const map={
    'hidden-hand-leak':'相手実ハンドを参照する経路を最優先で遮断。評価・AIコピー・スナップショットは相手レンジ前提だけに固定する。',
    'exception':'監査中の例外を先に潰す。自動プレーで落ちる局面は通常プレーでも壊れる可能性が高い。',
    'timeout':'アクション進行/オールイン自動ランアウトを確認。プレーが止まるスポット生成は練習価値を落とす。',
    'premise-context':'プリフロップの名前付けを修正。リンプ→アイソ、3BET→4BET、BBディフェンスを誤ると後続評価もずれる。',
    'ai-preflop-premise':'AIのプリフロップレンジ/サイズを調整する。通常プレー中のAIリークは出題前提破綻とは分けて扱う。',
    'comment-deduction-contradiction':'コメント生成と減点結果の最終整合レイヤーを追加。「正当なら最初から正当」と書かせる。',
    'one-pair-call-contradiction':'リバーワンペアのコール/フォールド軸を優先確認。完成ボード・大サイズ・複数ストリート圧力を重く見る。',
    'ft-learning-contradiction':'FT学習テーマと最終品質判定を同期する。危険テーマが出る時は肯定コメントで正当化しない。',
    'ft-learning-missing':'FTレンジ表/FTポストフロップの危険判定を、利用者が次に直す一つの学習テーマへ集約する。',
    'scenario-quality':'フロップ練習の生成条件を見直す。SPR/参加人数/ヒーロー行動余地がある出題だけ通す。',
    'large-deduction':'大減点の理由がユーザーに伝わるか確認。サイズ違い・ライン違い・局面違いを分けて説明する。',
    'donk-check-weight':'OOP側チェックを自然扱いする主導権/ドンク判定を見直す。',
    'river-one-pair-missing-profile':'リバーのワンペアコールには必ず専用プロファイルを付ける。',
    'review-too-long':'レビュー文を結論・理由・推奨サイズの3点に圧縮する。詳しい軸は内部/監査側に残す。',
    'bluff-comment-too-long':'ブラフ候補説明を「候補の質」「降ろす相手」「サイズ帯」の短い一文へ圧縮する。',
    'review-duplicate-phrase':'同じ語句を複数のプロファイルから重ねて出している。最終整文で重複を1回にまとめる。',
    'raw-effective-gap':'Raw EQと実効EQの差が大きい局面で、Raw EQだけを根拠にした説明を避ける。'
  };
  return map[type]||'該当issueの発生ハンドを確認し、説明と減点が同じ判断軸を見ているか確認する。';
}
function buildFishTankAuditRepairQueue(summary){
  const buckets={};
  (summary&&summary.suspiciousHands||[]).forEach(function(h){
    (h.issues||[]).forEach(function(issue){
      const key=issue.type||'unknown';
      if(!buckets[key])buckets[key]={type:key,severity:issue.severity||'low',count:0,score:0,examples:[],suggestion:auditRepairSuggestion(key)};
      const b=buckets[key];
      b.count++;
      b.score+=auditIssuePriorityWeight(issue);
      if(({critical:4,high:3,medium:2,low:1}[issue.severity]||1)>(({critical:4,high:3,medium:2,low:1}[b.severity])||1))b.severity=issue.severity;
      if(b.examples.length<3)b.examples.push({mode:h.mode,modeId:h.modeId,sampleIndex:h.sampleIndex,handNum:h.handNum,hero:h.hero,board:h.board,text:issue.text});
    });
  });
  const queue=Object.keys(buckets).map(function(k){return buckets[k];}).sort(function(a,b){
    if(b.score!==a.score)return b.score-a.score;
    return b.count-a.count;
  });
  return{seed:summary?summary.seed:null,totalBuckets:queue.length,totalIssues:queue.reduce(function(s,b){return s+b.count;},0),queue:queue};
}
function runFishTankAuditBatch(opts){
  opts=opts||{};
  const perMode=Math.max(1,Math.min(12,opts.perMode||3));
  const seed=opts.seed||20260605;
  const modes=[
    {id:'ring',label:'リング',make:createAuditRingGame},
    {id:'scenario',label:'フロップ練習',make:createAuditScenarioGame},
    {id:'tournament:bubble_call',label:'T:バブル薄コール',make:function(){return createAuditTournamentGame('bubble_call');}},
    {id:'tournament:bb_defend',label:'T:BBディフェンス',make:function(){return createAuditTournamentGame('bb_defend');}},
    {id:'tournament:reshove20',label:'T:20BBリショーブ',make:function(){return createAuditTournamentGame('reshove20');}},
    {id:'tournament:openjam14',label:'T:14BBオープンJam',make:function(){return createAuditTournamentGame('openjam14');}},
    {id:'tournament:ft_payjump',label:'T:FTペイジャンプ',make:function(){return createAuditTournamentGame('ft_payjump');}},
    {id:'tournament:hu_aggression',label:'T:HU攻防',make:function(){return createAuditTournamentGame('hu_aggression');}}
  ];
  const summary={seed:seed,perMode:perMode,totalHands:0,suspiciousCount:0,criticalCount:0,highCount:0,mediumCount:0,byMode:{},suspiciousHands:[],generatedAt:new Date().toISOString()};
  return withSeededRandomForAudit(seed,function(){
    modes.forEach(function(m){
      summary.byMode[m.id]={label:m.label,hands:0,suspicious:0,critical:0,high:0,medium:0};
      for(let i=0;i<perMode;i++){
        let hr=null,an=null,issues=[];
        try{
          const g=m.make();
          hr=playAuditGame(g,opts.maxActions||90);
          an=hr?analyzeHand(hr):null;
          issues=auditIssuesForHand(hr,an,m.label);
        }catch(e){
          issues=[{severity:'critical',type:'exception',text:'監査中に例外が発生しました: '+(e&&e.message?e.message:String(e)),meta:null}];
        }
        summary.totalHands++;
        summary.byMode[m.id].hands++;
        if(issues.length){
          summary.suspiciousCount++;
          summary.byMode[m.id].suspicious++;
          const hasC=issues.some(function(x){return x.severity==='critical';});
          const hasH=issues.some(function(x){return x.severity==='high';});
          const hasM=issues.some(function(x){return x.severity==='medium';});
          if(hasC){summary.criticalCount++;summary.byMode[m.id].critical++;}
          if(hasH){summary.highCount++;summary.byMode[m.id].high++;}
          if(hasM){summary.mediumCount++;summary.byMode[m.id].medium++;}
          if(summary.suspiciousHands.length<(opts.maxExamples||24))summary.suspiciousHands.push(compactAuditHand(hr,an,m.label,issues,m.id,i+1));
        }
      }
    });
    summary.ok=summary.criticalCount===0;
    summary.repairQueue=buildFishTankAuditRepairQueue(summary);
    return summary;
  });
}
function fishTankAuditBatchReportText(summary){
  if(!summary)return'監査バッチ結果がありません。';
  const lines=[
    'Fish Tank 監査バッチ: '+summary.totalHands+' hands',
    '違和感: '+summary.suspiciousCount+' / Critical: '+summary.criticalCount+' / High: '+summary.highCount+' / Medium: '+summary.mediumCount,
    'Seed: '+summary.seed
  ];
  Object.keys(summary.byMode||{}).forEach(function(k){
    const m=summary.byMode[k];
    lines.push('- '+m.label+': '+m.suspicious+'/'+m.hands+'件');
  });
  if(summary.repairQueue&&summary.repairQueue.queue&&summary.repairQueue.queue.length){
    lines.push('');
    lines.push('修正優先度トップ:');
    summary.repairQueue.queue.slice(0,3).forEach(function(b,idx){
      lines.push((idx+1)+'. '+b.type+' ['+b.severity+'] '+b.count+'件');
    });
  }
  if(summary.suspiciousHands&&summary.suspiciousHands.length){
    lines.push('');
    lines.push('抽出された確認候補:');
    summary.suspiciousHands.forEach(function(h,idx){
      lines.push((idx+1)+'. '+h.mode+' '+h.modeId+'['+h.sampleIndex+'] #'+h.handNum+' '+h.hero+' / '+h.board+' / '+h.score+'点 '+h.grade);
      h.issues.slice(0,4).forEach(function(i){lines.push('   ['+i.severity+'] '+i.type+': '+i.text);});
      if(h.issues.length>4)lines.push('   ...ほか '+(h.issues.length-4)+' 件');
    });
  }else{
    lines.push('抽出候補なし。少なくとも機械監査では重大な違和感は見つかりませんでした。');
  }
  return lines.join('\n');
}
function fishTankAuditRepairPlanText(summary){
  const rq=summary&&summary.repairQueue?summary.repairQueue:buildFishTankAuditRepairQueue(summary);
  if(!rq||!rq.queue||!rq.queue.length)return'修正キューは空です。重大な監査候補はありません。';
  const lines=['Fish Tank 修正キュー: '+rq.totalIssues+' issues / '+rq.totalBuckets+' buckets'];
  rq.queue.forEach(function(b,idx){
    lines.push('');
    lines.push((idx+1)+'. '+b.type+' ['+b.severity+'] '+b.count+'件');
    lines.push('   方針: '+b.suggestion);
    b.examples.forEach(function(ex){
      lines.push('   例: '+ex.mode+' '+ex.modeId+'['+ex.sampleIndex+'] #'+ex.handNum+' '+ex.hero+' / '+ex.board);
    });
  });
  lines.push('');
  lines.push('再現: runFishTankAuditBatch({perMode:'+(summary&&summary.perMode||3)+', seed:'+(summary&&summary.seed||20260605)+'})');
  return lines.join('\n');
}


// ---- UI ----
let game=null,aiLevel='medium';
const $=id=>document.getElementById(id);
function showScreen(id){document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));$(id).classList.add('active');}
function toast(msg,type,dur){
  dur=dur||3000;const el=document.createElement('div');
  el.className='toast '+(type||'info');el.textContent=msg;
  $('toast-container').appendChild(el);setTimeout(()=>el.remove(),dur);
}
function cardHTML(c,big){
  if(!c)return '<div class="card'+(big?' big':'')+' back"></div>';
  return '<div class="card'+(big?' big':'')+' '+(c.isRed?'red':'black')+'"><span>'+c.rank+'</span><span>'+c.sym+'</span></div>';
}
function cHTML(c){
  if(!c)return '<div class="c-card placeholder"></div>';
  return '<div class="c-card '+(c.isRed?'red':'black')+'"><span>'+c.rank+'</span><span>'+c.sym+'</span></div>';
}

function renderTable(){
  if(!game)return;
  renderScenarioBanner();
  const sel=SEAT_SELECTION[game.players.length];
  const con=$('seats-container');con.innerHTML='';
  game.players.forEach((pl,pi)=>{
    if(!pl.active)return;
    const baseSp=ALL_SEAT_POS[sel[pi]];
    const sp={x:baseSp.x,y:baseSp.y};
    // [Codex fix 2026-06-15] スマホ幅では上側/端の席を少し内側へ寄せ、HUDや画面端との重なりを防ぐ。
    if(window.innerWidth<=600){
      // [Codex fix 2026-06-21] 8〜9人卓のスマホ表示は、左右端と斜め席が重なりやすいので専用座標で少し離す。
      const mpos=[
        {x:50,y:88},{x:25,y:80},{x:11,y:58},{x:19,y:19},{x:39,y:12},
        {x:61,y:12},{x:81,y:19},{x:89,y:58},{x:75,y:80}
      ];
      if(game.players.length>=8&&mpos[sel[pi]]){
        sp.x=mpos[sel[pi]].x;sp.y=mpos[sel[pi]].y;
      }
      if(sp.y<=10)sp.y+=6;
      else if(sp.y<=25)sp.y+=3;
      if(sp.x<=10)sp.x+=3;
      else if(sp.x>=90)sp.x-=3;
    }
    const isDlr=pi===game.dealerIndex,isSB=pi===game.sbIdx,isBB=pi===game.bbIdx;
    const isAct=pi===game.actionIdx&&game.street!=='showdown';
    const isWin=game._lastWinners&&game._lastWinners.includes(pi);
    let cls='seat';
    if(isAct)cls+=' active-seat';
    if(pl.folded)cls+=' folded-seat';
    if(isWin)cls+=' winner-seat';
    // 全ポジションにバッジを付ける
    const posStr=posLabel(pi,game.dealerIndex,game.players.length);
    const posBadgeMap={BTN:'badge-d',SB:'badge-sb',BB:'badge-bb',UTG:'badge-utg','UTG+1':'badge-utg1',MP:'badge-mp',LJ:'badge-lj',HJ:'badge-hj',CO:'badge-co'};
    const posBadgeCls=posBadgeMap[posStr]||'badge-co';
    const isHU=game.players.filter(p=>p.active).length===2;
    let badge='';
    if(isHU){
      // ヘッズアップ: SB/BBのみ（Dマーカーなし）
      if(isSB)badge+='<span class="seat-pos-badge badge-sb">SB</span> ';
      else if(isBB)badge+='<span class="seat-pos-badge badge-bb">BB</span> ';
    } else {
      if(isDlr)badge+='<span class="seat-pos-badge badge-d">BTN</span> ';
      else if(isSB)badge+='<span class="seat-pos-badge badge-sb">SB</span> ';
      else if(isBB)badge+='<span class="seat-pos-badge badge-bb">BB</span> ';
      else badge+='<span class="seat-pos-badge '+posBadgeCls+'">'+posStr+'</span> ';
    }
    let holes='';
    if(!pl.isHuman){
      if(game.street==='showdown'&&!pl.folded&&pl.holeCards.length)holes=pl.holeCards.map(c=>cardHTML(c)).join('');
      else if(pl.holeCards.length)holes=cardHTML(null)+cardHTML(null);
    }
    const nc=pl.profile?'color:'+pl.profile.color:'color:#1a1a2e';
    const el=document.createElement('div');
    el.className=cls;el.style.left=sp.x+'%';el.style.top=sp.y+'%';
    // 上部シート（y<35%）はカードを下に、下部は上に表示してHUDとの重なりを防ぐ
    const isTopSeat=sp.y<35;
    // [Codex fix 2026-05-29] 浮遊吹き出しは9人卓で席同士が衝突するため、直近アクションは席パネル内に収める。
    const la=game._lastActions&&game._lastActions[pi];
    let seatActionHTML='';
    if(la&&la.handNum===game.handNum&&Date.now()-la.ts<2400){
      const abCls={fold:'ab-fold',check:'ab-check',call:'ab-call',raise:'ab-raise',allin:'ab-allin'}[la.action]||'ab-call';
      const isBetA=la.action==='raise'&&la.amount>0;
      const actionLabel={
        fold:'フォールド',
        check:'チェック',
        call:'コール '+la.amount,
        raise:(isBetA?'ベット':'レイズ')+' '+la.amount,
        allin:'ALL-IN '+la.amount
      }[la.action]||la.action;
      seatActionHTML='<div class="seat-action '+abCls+'" title="'+(pl.isHuman?'あなた':pl.name)+'['+posStr+']: '+actionLabel+'">'+actionLabel+'</div>';
    }
    const seatInfo='<div class="seat-info"><div class="seat-info-main"><div>'+badge+'</div>'
      +'<div class="seat-name" style="'+nc+'">'+(pl.isHuman?'あなた':pl.name)+'</div>'
      +'<div class="seat-chips">'+pl.chips+'</div>'
      +'<div class="seat-bet">'+(pl.currentBet>0?pl.currentBet:'')+'</div></div>'
      +seatActionHTML
      +'</div>';
    const holesDiv='<div class="hole-cards">'+holes+'</div>';
    const dlrBadge=isDlr&&!isHU?'<div class="dealer-marker">D</div>':'';
    const seatInfoD=seatInfo.replace('<div class="seat-info">','<div class="seat-info">'+dlrBadge);
    el.innerHTML=(isTopSeat?seatInfoD+holesDiv:holesDiv+seatInfoD);
    con.appendChild(el);
  });
  const cc=$('community-cards');cc.innerHTML='';
  for(let i=0;i<5;i++)cc.innerHTML+=cHTML(game.community[i]||null);
  $('pot-display').textContent='Pot: '+game.pot;
  // [Codex fix 2026-05-29] 中央表示にも現在のアクション順を出し、視線をテーブル中央に戻せるようにする。
  const activePl=game.actionIdx>=0&&game.street!=='showdown'?game.players[game.actionIdx]:null;
  const activePos=activePl?posLabel(game.actionIdx,game.dealerIndex,game.players.length):'';
  $('stage-label').textContent=game.street.toUpperCase()+(activePl?' / '+(activePl.isHuman?'あなた':activePl.name)+'['+activePos+']':'');
  const tctx=game.tournamentContext;
  $('hud-info').textContent='Hand #'+game.handNum+' | SB '+game.sb+' / BB '+game.bb+(tctx&&tctx.enabled?' / BBA '+tctx.bbAnte+' | '+tctx.phase+' '+tctx.stackBB+'BB':'');
  refreshHudPracticeFocus();
  const h=game.players.find(p=>p.isHuman);
  $('human-cards').innerHTML=h.holeCards.map(c=>cardHTML(c,true)).join('');
  $('human-hand-name').textContent=h.holeCards.length&&game.community.length>=3
    ?HandEval.evaluate([...h.holeCards,...game.community]).name:'';
  renderActions();
}

function renderActions(){
  const h=game.players.find(p=>p.isHuman);
  const my=game.isHumanTurn();
  const tc=game.getToCall();
  const pre=game.street==='preflop';
  ['btn-fold','btn-check','btn-call','btn-raise','btn-allin','raise-slider'].forEach(id=>{if($(id))$(id).disabled=!my;});
  // size-row は自分のターンのみ表示
  if($('size-row'))$('size-row').style.opacity=my?'1':'0.4';
  const qb=$('quick-btns');qb.innerHTML='';
  if(my){
    // クイックボタン共通: 即ベット実行
    function qbtnAct(amt){
      setRaise(amt); // スライダーにも反映
      const allTarget=h.chips+h.currentBet;
      if(amt>=allTarget)humanAction('allin',0);
      else humanAction('raise',amt);
    }
    // プリフロップでレイズ未発生（currentBet === BB）= オープン/ISOレイズ局面
    const pfNoRaise=pre&&game.currentBet<=game.bb;
    const tctx=game.tournamentContext&&game.tournamentContext.enabled?game.tournamentContext:null;
    const stackBB=tctx?Math.max(1,Math.round(h.chips/game.bb)):null;
    function addQ(label,amt,title){
      const b=document.createElement('button');b.className='qbtn';b.textContent=label;
      if(title)b.title=title;
      b.addEventListener('click',function(){qbtnAct(amt);});qb.appendChild(b);
    }
    if(tc>0&&!pfNoRaise){
      if(tctx&&pre&&stackBB<=20&&['reshove20','bubble_call','bb_defend'].includes(tctx.focusId)){
        addQ('Jam',h.chips+h.currentBet,'Tモード: '+(tctx.focusLabel||'')+'ではreshove/fold判断が重要です');
      }
      // 相手のレイズに対してレイズ返し → 2x/3x/4x/5x（ベット額の倍数）
      raiseOverBetQuickOptions(game.currentBet,game.currentBet+game.minRaise,h.chips+h.currentBet).forEach(function(opt){
        if(opt.amt>h.currentBet){
          addQ(opt.label,opt.amt,opt.title);
        }
      });
    } else if(pfNoRaise||pre){
      if(tctx&&pre&&stackBB<=14&&['openjam14','bubble_call'].includes(tctx.focusId)){
        addQ('Jam',h.chips+h.currentBet,'Tモード: 14BB前後はopen jam候補が増えます');
      }
      // プリフロップ: オープン or ISO（リンパーへのレイズ）→ 常に 2BB/2.5BB/3BB から選ぶ。
      preflopOpenQuickOptions(game.bb,h.chips+h.currentBet).forEach(function(opt){
        if(opt.amt>h.currentBet){
          addQ(opt.label,opt.amt,opt.title);
        }
      });
    } else {
      const pot=game.pot;
      const minR=game.currentBet+game.minRaise;
      const total=h.chips+h.currentBet;
      postflopQuickBetOptions(pot,Math.max(1,minR),total).forEach(function(opt){
        const b=document.createElement('button');b.className='qbtn';
        const isAllin=opt.amt>=total;
        b.textContent=isAllin&&opt.label!=='All-in'?opt.label+' All-in':opt.label;
        if(opt.title||isAllin)b.title=opt.title||(isAllin?'スタック不足のためオールインになります':'');
        b.addEventListener('click',function(){qbtnAct(opt.amt);});qb.appendChild(b);
      });
    }
    if(tc===0){
      $('btn-check').style.display='';$('btn-call').style.display='none';$('btn-fold').style.display='none';
      $('to-call-label').style.display='none';
      // 誰もベットしていない＝最初のアクション → 「ベット」
      $('btn-raise').textContent=pre?'レイズ':'ベット';
    } else {
      $('btn-check').style.display='none';$('btn-call').style.display='';$('btn-fold').style.display='';
      $('btn-call').textContent='コール '+Math.min(tc,h.chips);
      $('to-call-label').textContent='コール: '+tc+' | Pot: '+game.pot;
      $('to-call-label').style.display='';
      // すでにベットあり → 「レイズ」
      $('btn-raise').textContent='レイズ';
    }
    const minR=Math.min(game.currentBet+game.minRaise,h.chips+h.currentBet);
    const sl=$('raise-slider');
    sl.min=minR;sl.max=h.chips+h.currentBet;
    if(+sl.value<minR)sl.value=minR;
    $('raise-amount').value=sl.value;
  } else {
    $('btn-check').style.display='';$('btn-call').style.display='';$('btn-fold').style.display='';
    $('to-call-label').style.display='none';
  }
}

function setRaise(amt){
  const sl=$('raise-slider');
  const v=Math.min(Math.max(amt,+sl.min),+sl.max);
  sl.value=v;$('raise-amount').value=v;
  document.querySelectorAll('.qbtn').forEach(b=>b.classList.remove('active-q'));
}

// FISH_TANK_REVIEW_TEXT_MODULE
function showAnalysis(hr,fromHistory){
  _analysisFromHistory=!!fromHistory;
  const an=analyzeHand(hr);
  const lesson=selectLesson(hr.decisions,hr);
  $('analysis-title').textContent='ハンド #'+hr.handNum+' レビュー';
  // [Claude feature 2026-05-23] シナリオモード: プリフロップストーリーをサブタイトルに表示
  $('analysis-sub').textContent=hr.pfStory?'🎯 '+hr.pfStory.narrative:'ポット: '+hr.pot+' | '+hr.street.toUpperCase();
  const totalP=hr.players.filter(p=>p.active!==false).length||hr.players.length;
  // ---- スコアを grade に変換 ----
  function scoreGrade(s){return s>=93?'S':s>=82?'A':s>=70?'B':s>=55?'C':s>=40?'D':'F';}
  const pfGrade=scoreGrade(an.pfScore);
  const poGrade=an.sawFlop?scoreGrade(an.poScore):null;
  let html='<div class="analysis-grade" style="padding:10px 12px">';
  // 2カラム: PF | PostF
  html+='<div style="display:flex;gap:8px;justify-content:center;align-items:stretch">';
  // プリフロップ
  html+='<div style="flex:1;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:8px;text-align:center">';
  html+='<div style="font-size:9px;font-weight:700;color:var(--dim);letter-spacing:.08em;margin-bottom:4px">PREFLOP</div>';
  html+='<div class="grade-letter grade-'+pfGrade+'" style="font-size:36px;line-height:1">'+pfGrade+'</div>';
  html+='<div style="font-size:11px;color:var(--dim);margin-top:3px">'+an.pfScore+'pt</div>';
  html+='</div>';
  // ポストフロップ
  html+='<div style="flex:1;background:var(--panel);border:1px solid var(--border);border-radius:12px;padding:8px;text-align:center">';
  html+='<div style="font-size:9px;font-weight:700;color:var(--dim);letter-spacing:.08em;margin-bottom:4px">POST FLOP</div>';
  if(an.sawFlop){
    html+='<div class="grade-letter grade-'+poGrade+'" style="font-size:36px;line-height:1">'+poGrade+'</div>';
    html+='<div style="font-size:11px;color:var(--dim);margin-top:3px">'+an.poScore+'pt</div>';
  }else{
    html+='<div style="font-size:22px;font-weight:900;color:var(--dim);line-height:1.5">—</div>';
    html+='<div style="font-size:10px;color:var(--dim);margin-top:2px">フロップ未到達</div>';
  }
  html+='</div>';
  html+='</div>';
  // 総合グレードは小さく表示
  html+='<div style="margin-top:6px;font-size:11px;color:var(--dim);text-align:center">総合: <strong style="color:var(--text)">'+an.grade+'</strong> — '+an.gradeLabel+'</div>';
  if(an.tournamentScores&&an.tournamentScores.length){
    const tcGradeCol={'S':'#d4a820','A':'#22a46c','B':'#3d6cf0','C':'#d87020','D':'#e04848','F':'#9333ea'};
    html+='<details class="analysis-secondary-block">';
    html+='<summary>スキル別スコア（トーナメント）</summary>';
    html+='<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px">';
    for(const ts of an.tournamentScores){
      const col=tcGradeCol[ts.grade]||'var(--dim)';
      html+='<div style="background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:7px;text-align:left">';
      html+='<div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><span style="font-size:10px;font-weight:800;color:var(--text)">'+ts.label+'</span><span style="font-size:15px;font-weight:900;color:'+col+'">'+ts.grade+'</span></div>';
      html+='<div style="font-size:10px;color:var(--dim);margin-top:2px">'+ts.score+'pt / '+ts.note+'</div>';
      html+='</div>';
    }
    html+='</div></details>';
  }
  if(an.liveCashScores&&an.liveCashScores.length){
    const rcGradeCol={'S':'#d4a820','A':'#22a46c','B':'#3d6cf0','C':'#d87020','D':'#e04848','F':'#9333ea'};
    html+='<details class="analysis-secondary-block">';
    html+='<summary>スキル別スコア（リング）</summary>';
    html+='<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px">';
    for(const rs of an.liveCashScores){
      const col=rcGradeCol[rs.grade]||'var(--dim)';
      html+='<div style="background:var(--panel);border:1px solid var(--border);border-radius:8px;padding:7px;text-align:left">';
      html+='<div style="display:flex;align-items:center;justify-content:space-between;gap:6px"><span style="font-size:10px;font-weight:800;color:var(--text)">'+rs.label+'</span><span style="font-size:15px;font-weight:900;color:'+col+'">'+rs.grade+'</span></div>';
      html+='<div style="font-size:10px;color:var(--dim);margin-top:2px">'+rs.score+'pt / '+rs.note+'</div>';
      html+='</div>';
    }
    html+='</div></details>';
  }
  if(an.primaryLesson){
    const pl=an.primaryLesson;
    const col=pl.severity==='bad'?'var(--red)':pl.severity==='good'?'var(--green)':'var(--gold)';
    html+='<div style="margin-top:9px;border-top:1px solid var(--border);padding-top:8px;text-align:left">';
    html+='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px"><span style="font-size:9px;font-weight:800;color:var(--dim);letter-spacing:.08em">MAIN LESSON</span><span style="font-size:10px;font-weight:800;color:'+col+'">'+(pl.modeLabel||'総合')+' / 信頼度 '+pl.confidence+'</span></div>';
    html+='<div style="font-size:13px;font-weight:900;color:var(--text);margin-bottom:4px">'+pl.title+'</div>';
    html+='<div style="font-size:11px;color:var(--text);line-height:1.6">'+pl.summary+'</div>';
    html+='<div style="font-size:10px;color:var(--dim);line-height:1.55;margin-top:4px">'+pl.reason+'</div>';
    html+='<div style="font-size:10px;color:'+col+';line-height:1.55;margin-top:4px;font-weight:700">'+pl.recommendation+'</div>';
    if(pl.supportingAxes&&pl.supportingAxes.length)html+='<div style="font-size:9px;color:var(--dim);line-height:1.45;margin-top:5px">補足要因: '+pl.supportingAxes.join(' / ')+'</div>';
    html+='</div>';
  }
  const showDevDiagnostics=document.body.classList.contains('codex-dev');
  if(showDevDiagnostics&&hr.scenarioQuality){
    const sq=hr.scenarioQuality;
    html+='<div style="margin-top:9px;border-top:1px solid var(--border);padding-top:8px;text-align:left">';
    html+='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px"><span style="font-size:9px;font-weight:800;color:var(--dim);letter-spacing:.08em">SCENARIO QUALITY</span><span style="font-size:13px;font-weight:900;color:'+(sq.ok?'var(--green)':'var(--orange)')+'">'+sq.grade+'</span></div>';
    html+='<div style="font-size:10px;color:var(--dim);line-height:1.45">'+trainingSpotQualityText(sq)+'</div>';
    html+='</div>';
  }
  if(showDevDiagnostics&&an.actualHandAudit){
    const aha=an.actualHandAudit;
    html+='<div style="margin-top:9px;border-top:1px solid var(--border);padding-top:8px;text-align:left">';
    html+='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px"><span style="font-size:9px;font-weight:800;color:var(--dim);letter-spacing:.08em">HIDDEN HAND AUDIT</span><span style="font-size:13px;font-weight:900;color:'+(aha.status==='PASS'?'var(--green)':'var(--red)')+'">'+aha.status+'</span></div>';
    html+='<div style="font-size:10px;color:var(--dim);line-height:1.45">'+actualHandLeakAuditText(aha)+'</div>';
    html+='</div>';
  }
  if(showDevDiagnostics&&an.premiseAudit&&(an.premiseAudit.issues.length||an.premiseAudit.warnings.length)){
    const pa=an.premiseAudit;
    html+='<div style="margin-top:9px;border-top:1px solid var(--border);padding-top:8px;text-align:left">';
    html+='<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:5px"><span style="font-size:9px;font-weight:800;color:var(--dim);letter-spacing:.08em">SOFTWARE PREMISE</span><span style="font-size:13px;font-weight:900;color:'+(pa.ok?'var(--green)':'var(--orange)')+'">'+pa.grade+'</span></div>';
    pa.issues.concat(pa.warnings).slice(0,4).forEach(function(x){
      html+='<div style="font-size:10px;color:'+(pa.issues.includes(x)?'var(--orange)':'var(--dim)')+';line-height:1.45;margin-top:3px">・'+x.text+'</div>';
    });
    html+='</div>';
  }
  html+='</div>';
  html+='<div class="analysis-section"><h3>結果</h3>';
  for(const w of hr.winners){
    const nm=w.player.isHuman?'あなた':w.player.name;
    const wIdx=w.playerIdx!=null?w.playerIdx:hr.players.findIndex(p=>p.name===w.player.name);
    const wPos=hr.dealerIndex!=null?posLabel(wIdx,hr.dealerIndex,totalP):'';
    const pc=w.player.profile?w.player.profile.color:'var(--dim)';
    html+='<div style="margin-bottom:6px"><span style="color:'+pc+';font-weight:700">'+nm+'</span>';
    if(wPos)html+=' <span style="font-size:10px;color:#a0aec0">['+wPos+']</span>';
    html+=' +'+w.amount+(w.byFold?' (相手フォールド)':'');
    if(w.eval&&!w.byFold)html+=' — <span style="color:var(--dim);font-size:11px">'+w.eval.name+'</span>';
    html+='</div>';
  }
  // ショーダウンに残ったプレイヤー + 必ずユーザーを含める
  const sp=hr.players.filter(p=>p.holeCards&&p.holeCards.length&&(!p.folded||p.isHuman));
  html+='<div style="display:flex;flex-wrap:wrap;gap:14px;margin-top:8px;">';
  const spSorted=[...sp].sort((a,b)=>a.isHuman?-1:b.isHuman?1:0);
  for(const p of spSorted){
    const pc=p.profile?p.profile.color:(p.isHuman?'var(--green)':'var(--dim)');
    const folded=p.folded&&!p.isHuman?'':p.folded?' <span style="color:var(--dim);font-size:9px">(フォールド)</span>':'';
    const pi=hr.players.indexOf(p);
    const posStr=hr.dealerIndex!=null?posLabel(pi,hr.dealerIndex,totalP):'';
    const posBadgeColor={BTN:'#c8921e',SB:'#c8921e',BB:'#c8921e',UTG:'#7d96b5','UTG+1':'#7d96b5',MP:'#7d96b5',LJ:'#22a46c',HJ:'#22a46c',CO:'#22a46c'}[posStr]||'#7d96b5';
    html+='<div style="text-align:center"><div style="font-size:10px;color:'+pc+';margin-bottom:2px">'+(p.isHuman?'あなた':p.name)+folded+'</div>';
    if(posStr)html+='<div style="font-size:9px;font-weight:700;color:'+posBadgeColor+';background:rgba(26,40,80,0.07);border-radius:4px;padding:1px 5px;margin-bottom:3px;display:inline-block">'+posStr+'</div>';
    html+='<div style="display:flex;gap:3px">'+p.holeCards.map(c=>cardHTML(c)).join('')+'</div>';
    if(p.handResult)html+='<div style="font-size:10px;color:var(--gold);margin-top:2px">'+p.handResult.name+'</div>';
    html+='</div>';
  }
  html+='</div></div>';
  html+='<div class="analysis-section"><h3>ボード</h3><div style="display:flex;gap:5px;margin-top:4px">'+hr.community.map(c=>cardHTML(c)).join('')+'</div></div>';
  if(an.evals.length>0){
    html+='<div class="analysis-section"><h3>あなたの判断分析</h3>';
    // ストリート別にグループ化 + 個別グレード
    const stOrder=['preflop','flop','turn','river'];
    const stEvMap={};
    for(const ev of an.evals){if(!stEvMap[ev.street])stEvMap[ev.street]=[];stEvMap[ev.street].push(ev);}
    // [Codex fix 2026-05-30] 同じTモード学習ポイントが各ストリートに重なると読みにくいため、リザルト内では一度だけ表示する。
    const shownTournamentLessons=new Set();
    const shownFinalTableLessons=new Set();
    const stLbl={preflop:'PREFLOP',flop:'FLOP',turn:'TURN',river:'RIVER'};
    const gradeCol={'S':'#d4a820','A':'#22a46c','B':'#3d6cf0','C':'#d87020','D':'#e04848','F':'#9333ea'};
    function metaChip(label,value,color){
      if(value==null||value==='')return '';
      return '<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 6px;border-radius:5px;background:var(--panel);border:1px solid var(--border);font-size:9px;color:'+(color||'var(--dim)')+'">'+label+': <strong>'+value+'</strong></span>';
    }
    function actionText(ev){
      const isBet=ev.action==='raise'&&ev.street!=='preflop'&&ev.toCall===0;
      if(ev.street==='preflop'&&(ev.action==='raise'||ev.action==='allin')&&ev.facingRaise){
        const n=(ev.pfActionBetLevel||((ev.pfRaiseCountBefore||1)+2));
        return (n>=5?'5BET':n===4?'4BET':'3BET')+' '+ev.amount;
      }
      if(ev.street==='preflop'&&ev.action==='call'&&ev.facingRaise&&(ev.pfFacingBetLevel||0)>=4)return '4BETコール '+ev.amount;
      return {fold:'フォールド',check:'チェック',call:'コール '+ev.amount,raise:(isBet?'ベット':'レイズ')+' '+ev.amount,allin:'オールイン '+ev.amount}[ev.action]||ev.action;
    }
    function decisionMeta(ev){
      let m='';
      if(ev.position)m+=metaChip('位置',ev.position);
      if(ev.lineContext)m+=metaChip('文脈',ev.lineContext,'var(--accent)');
      if(ev.evalAxis)m+=metaChip('判断軸',ev.evalAxis,'var(--gold)');
      if(ev.equitySource)m+=metaChip('EQ基準',ev.equitySource,'var(--green)');
      if(ev.axisTags&&ev.axisTags.length)m+=metaChip('副軸',ev.axisTags.join(' / '));
      if(ev.axisWeightNote)m+=metaChip('軸補正',ev.axisWeightNote,'var(--gold)');
      if(ev.liveCashSpotProfile)m+=metaChip('リング文脈',liveCashSpotProfileText(ev.liveCashSpotProfile),ev.liveCashSpotProfile.severity==='bad'?'var(--red)':ev.liveCashSpotProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.liveCashSprProfile)m+=metaChip('SPR文脈',liveCashSprProfileText(ev.liveCashSprProfile),ev.liveCashSprProfile.severity==='bad'?'var(--red)':ev.liveCashSprProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.liveCashInitiativeProfile)m+=metaChip('主導権文脈',liveCashInitiativeProfileText(ev.liveCashInitiativeProfile),ev.liveCashInitiativeProfile.severity==='bad'?'var(--red)':ev.liveCashInitiativeProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.liveCashReraisedPotProfile)m+=metaChip('3BET文脈',liveCashReraisedPotProfileText(ev.liveCashReraisedPotProfile),ev.liveCashReraisedPotProfile.severity==='bad'?'var(--red)':ev.liveCashReraisedPotProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.liveCashMultiwayProfile)m+=metaChip('MW文脈',liveCashMultiwayProfileText(ev.liveCashMultiwayProfile),ev.liveCashMultiwayProfile.severity==='bad'?'var(--red)':ev.liveCashMultiwayProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.liveCashRiverDecisionProfile)m+=metaChip('リバー金額',liveCashRiverDecisionProfileText(ev.liveCashRiverDecisionProfile),ev.liveCashRiverDecisionProfile.severity==='bad'?'var(--red)':ev.liveCashRiverDecisionProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.onePairProfile)m+=metaChip('ワンペア監査',onePairPressureProfileText(ev.onePairProfile),ev.onePairProfile.verdict==='bad'?'var(--red)':ev.onePairProfile.verdict==='good'?'var(--green)':'var(--gold)');
      if(ev.tournamentPhaseAxis)m+=metaChip('フェーズ軸',ev.tournamentPhaseAxis,'var(--accent)');
      if(ev.phaseWeightNote)m+=metaChip('フェーズ補正',ev.phaseWeightNote,'var(--gold)');
      if(ev.bubbleProfile)m+=metaChip('バブル立場',ev.bubbleProfile.archetype,'var(--red)');
      if(ev.bubbleProfile)m+=metaChip('危険タイプ',ev.bubbleProfile.risk,'var(--gold)');
      if(ev.bubbleProfile&&ev.bubbleProfile.bubbleDistance!=null)m+=metaChip('通過まで',ev.bubbleProfile.bubbleDistance+'人');
      if(ev.bubbleProfile&&ev.bubbleProfile.coverCount)m+=metaChip('下位スタック',ev.bubbleProfile.coverCount+'人','var(--gold)');
      if(ev.shortestOppStackBB!=null)m+=metaChip('最短相手',ev.shortestOppStackBB+'BB');
      if(ev.nextBBPressure)m+=metaChip('BB接近',ev.nextBBPressure,'var(--gold)');
      if(ev.bubbleIcmRange)m+=metaChip('バブルICM表',ev.bubbleIcmRange.verdict+' / '+ev.bubbleIcmRange.laneLabel,ev.bubbleIcmRange.severity==='bad'?'var(--red)':ev.bubbleIcmRange.severity==='border'?'var(--gold)':'var(--green)');
      if(ev.earlyProfile)m+=metaChip('序盤参加',ev.earlyProfile.verdict+' / '+ev.earlyProfile.actionLabel,ev.earlyProfile.severity==='bad'?'var(--red)':ev.earlyProfile.severity==='border'?'var(--gold)':'var(--green)');
      if(ev.earlyProfile)m+=metaChip('序盤方針',ev.earlyProfile.plan,'var(--gold)');
      if(ev.earlyProfile&&ev.earlyProfile.participationLeak)m+=metaChip('リンプ/CC',ev.earlyProfile.participationLeak,'var(--gold)');
      if(ev.earlyProfile&&ev.earlyProfile.exceptionReason)m+=metaChip('参加例外',ev.earlyProfile.exceptionReason,'var(--green)');
      if(ev.earlyProfile&&ev.earlyProfile.speculative&&ev.earlyProfile.speculative.type)m+=metaChip('投機評価',ev.earlyProfile.speculative.status+' / '+ev.earlyProfile.speculative.reason,ev.earlyProfile.speculative.status==='bad'?'var(--red)':ev.earlyProfile.speculative.status==='border'?'var(--gold)':'var(--green)');
      if(ev.earlyMultiwayProfile)m+=metaChip('序盤MW',tournamentEarlyMultiwayProfileText(ev.earlyMultiwayProfile),ev.earlyMultiwayProfile.severity==='bad'?'var(--red)':ev.earlyMultiwayProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.earlyDeepSprProfile)m+=metaChip('序盤深SPR',tournamentEarlyDeepSprProfileText(ev.earlyDeepSprProfile),ev.earlyDeepSprProfile.severity==='bad'?'var(--red)':ev.earlyDeepSprProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.middleProfile)m+=metaChip('中盤帯',ev.middleProfile.band,'var(--accent)');
      if(ev.middleProfile)m+=metaChip('中盤方針',ev.middleProfile.policy,'var(--gold)');
      if(ev.middleProfile&&ev.middleProfile.deepAxes)m+=metaChip('中盤5軸',ev.middleProfile.deepAxes.join(' / '),'var(--gold)');
      if(ev.finalTableProfile)m+=metaChip('FT評価',tournamentFinalTableProfileText(ev.finalTableProfile),ev.finalTableProfile.severity==='bad'?'var(--red)':ev.finalTableProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.finalTableProfile&&ev.finalTableProfile.stackRole)m+=metaChip('FT立場',ev.finalTableProfile.stackRole,'var(--gold)');
      if(ev.finalTableProfile&&ev.finalTableProfile.collisionProfile)m+=metaChip('FT衝突相手',ev.finalTableProfile.collisionProfile.opponent+(ev.finalTableProfile.collisionProfile.oppBB?' '+ev.finalTableProfile.collisionProfile.oppBB+'BB':''),'var(--gold)');
      if(ev.finalTableRangeProfile)m+=metaChip('FTレンジ表',ev.finalTableRangeProfile.verdict+' / '+ev.finalTableRangeProfile.label,ev.finalTableRangeProfile.severity==='bad'?'var(--red)':ev.finalTableRangeProfile.severity==='border'?'var(--gold)':'var(--green)');
      if(ev.finalTablePostflopProfile)m+=metaChip('FTポストF',tournamentFinalTablePostflopProfileText(ev.finalTablePostflopProfile),ev.finalTablePostflopProfile.severity==='bad'?'var(--red)':ev.finalTablePostflopProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.finalTableLearningPoint)m+=metaChip('FT学習',ev.finalTableLearningPoint.category+' / '+ev.finalTableLearningPoint.title,ev.finalTableLearningPoint.severity==='bad'?'var(--red)':ev.finalTableLearningPoint.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.finalTableProfile&&ev.finalTableProfile.deepAxes)m+=metaChip('FT5軸',ev.finalTableProfile.deepAxes.join(' / '),'var(--gold)');
      if(ev.headsUpProfile)m+=metaChip('HU評価',tournamentHeadsUpProfileText(ev.headsUpProfile),ev.headsUpProfile.severity==='bad'?'var(--red)':ev.headsUpProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.headsUpProfile&&ev.headsUpProfile.deepAxes)m+=metaChip('HU5軸',ev.headsUpProfile.deepAxes.join(' / '),'var(--gold)');
      if(ev.headsUpRiverProfile)m+=metaChip('HUリバー',tournamentHeadsUpRiverProfileText(ev.headsUpRiverProfile),ev.headsUpRiverProfile.severity==='bad'?'var(--red)':ev.headsUpRiverProfile.severity==='good'?'var(--green)':'var(--gold)');
      if(ev.toCall>0)m+=metaChip('必要コール',ev.toCall+'T');
      if(ev.potOdds>0)m+=metaChip('必要EQ',Math.round(ev.potOdds*100)+'%');
      if(ev.rawEqPct!=null)m+=metaChip('Raw EQ',ev.rawEqPct+'%');
      if(ev.effectiveEqPct!=null)m+=metaChip('実効EQ',ev.effectiveEqPct+'%',ev.effectiveEqPct>=Math.round((ev.potOdds||0)*100)?'var(--green)':'var(--red)');
      if(ev.realizationPct!=null)m+=metaChip('実現率',ev.realizationPct+'%');
      if(ev.rangeAdv)m+=metaChip('レンジ優位',ev.rangeAdv,ev.rangeAdv==='高'?'var(--green)':ev.rangeAdv==='低'?'var(--red)':'var(--gold)');
      if(ev.nutAdv)m+=metaChip('ナッツ優位',ev.nutAdv,ev.nutAdv==='高'?'var(--green)':ev.nutAdv==='低'?'var(--red)':'var(--gold)');
      if(ev.strategyMix)m+=metaChip('推奨頻度',ev.strategyMix);
      if(ev.stackBB!=null)m+=metaChip('有効BB',ev.stackBB+'BB');
      if(ev.bbAnte!=null)m+=metaChip('BBアンティ',ev.bbAnte+'T');
      if(ev.tournamentPhase)m+=metaChip('局面',ev.tournamentPhase);
      if(ev.tournamentFocus)m+=metaChip('テーマ',ev.tournamentFocus,'var(--gold)');
      if(ev.stackBand)m+=metaChip('スタック帯',ev.stackBand);
      if(ev.icmPressure)m+=metaChip('ICM圧',ev.icmPressure,ev.icmPressure==='高'?'var(--red)':ev.icmPressure==='中'?'var(--gold)':'var(--dim)');
      if(ev.tournamentRangeProfile)m+=metaChip('レンジ判定',ev.tournamentRangeProfile.verdict,ev.tournamentRangeProfile.severity==='bad'?'var(--red)':ev.tournamentRangeProfile.severity==='border'?'var(--gold)':'var(--green)');
      if(ev.coverLabel)m+=metaChip('カバー',ev.coverLabel+(ev.coverDeltaBB?' +'+ev.coverDeltaBB+'BB':''),ev.coverPressure==='高'?'var(--red)':ev.coverPressure==='攻め可'?'var(--green)':'var(--gold)');
      if(ev.tournamentAxis)m+=metaChip('主軸',ev.tournamentAxis,'var(--gold)');
      if(ev.freqPct!=null)m+=metaChip('推定頻度',ev.freqPct+'%',ev.freqPct>=45?'var(--green)':ev.freqPct>=32?'var(--gold)':'var(--red)');
      if(ev.evLoss)m+=metaChip('EV損失',({none:'なし',minimal:'ごく小',mix:'混合',low:'小',moderate:'中',significant:'大'}[ev.evLoss]||ev.evLoss),ev.evLoss==='moderate'||ev.evLoss==='significant'?'var(--red)':'var(--dim)');
      if(ev.isMix)m+=metaChip('戦略', '混合可', 'var(--gold)');
      if(ev.deduction>0)m+=metaChip('減点',ev.deduction+'pt',ev.quality==='bad'?'var(--red)':'var(--gold)');
      return m?'<div style="margin:2px 0 4px">'+m+'</div>':'';
    }
    for(const st of stOrder){
      const evs=stEvMap[st];if(!evs||evs.length===0)continue;
      // ストリートスコア計算
      const stDed=evs.reduce(function(s,e){return s+(e.deduction||0);},0);
      const stScore=Math.max(0,Math.min(100,100-stDed));
      const stGrade=scoreGrade(stScore);
      const gc=gradeCol[stGrade]||'var(--dim)';
      const stHasIssue=evs.some(function(e){return e.quality!=='good'||(e.deduction||0)>0;});
      html+='<details class="analysis-street-block" data-issue="'+(stHasIssue?'1':'0')+'">';
      html+='<summary>';
      html+='<span style="font-size:10px;font-weight:800;color:var(--dim);letter-spacing:.1em">'+stLbl[st]+'</span>';
      html+='<span style="font-size:15px;font-weight:900;color:'+gc+';background:var(--panel2);border:1px solid '+gc+';border-radius:5px;padding:0 7px;line-height:1.6">'+stGrade+'</span>';
      html+='<span style="font-size:10px;color:var(--dim)">'+stScore+'pt</span>';
      html+='</summary>';
      for(const ev of evs){
        const actLabel=actionText(ev);
        const poStr=ev.potOdds>0?' <span style="color:var(--dim)">(PO '+Math.round(ev.potOdds*100)+'%)</span>':'';
        const suggestHTML=ev.suggest?'<div style="margin-top:4px;color:var(--gold);font-size:10px;font-weight:600">▶ '+ev.suggest+'</div>':'';
        let tLessonHTML='';
        let ftLessonHTML='';
        if(ev.tournamentLesson&&!shownTournamentLessons.has(ev.tournamentLesson)){
          shownTournamentLessons.add(ev.tournamentLesson);
          tLessonHTML='<div style="margin-top:6px;padding:6px 8px;border-left:3px solid var(--gold);background:rgba(212,168,32,.08);border-radius:6px;color:var(--text);font-size:10px;line-height:1.55"><strong style="color:var(--gold)">Tモード学習ポイント:</strong> '+ev.tournamentLesson+'</div>';
        }
        if(ev.finalTableLearningPoint){
          const lp=ev.finalTableLearningPoint;
          const lessonKey=lp.category+'|'+lp.severity;
          if(shownFinalTableLessons.has(lessonKey)){
            ftLessonHTML='';
          }else{
            shownFinalTableLessons.add(lessonKey);
            const col=lp.severity==='bad'?'var(--red)':lp.severity==='good'?'var(--green)':'var(--gold)';
            ftLessonHTML='<div style="margin-top:6px;padding:6px 8px;border-left:3px solid '+col+';background:rgba(212,168,32,.07);border-radius:6px;color:var(--text);font-size:10px;line-height:1.55"><strong style="color:'+col+'">FT学習テーマ:</strong> '+tournamentFinalTableLearningPointText(lp)+'</div>';
          }
        }
        const tRangeHTML=ev.tournamentRangeHint?'<div style="margin-top:5px;padding:5px 8px;border:1px dashed var(--border);background:var(--panel);border-radius:6px;color:var(--dim);font-size:10px;line-height:1.5"><strong style="color:var(--text)">Tレンジ目安:</strong> '+ev.tournamentRangeHint+'</div>':'';
        const tProfileHTML=ev.tournamentRangeProfile?'<div style="margin-top:5px;padding:5px 8px;border:1px solid rgba(61,108,240,.18);background:rgba(61,108,240,.06);border-radius:6px;color:var(--text);font-size:10px;line-height:1.5"><strong style="color:var(--accent)">Tレンジ判定:</strong> '+tournamentRangeProfileText(ev.tournamentRangeProfile)+'</div>':'';
        const coachHTML='<div class="coach-review" style="font-size:12px;line-height:1.75;color:var(--text)">'+coachReviewHTML(ev)+'</div>';
        const detailHTML=compactReviewDetailsHTML(ev,decisionMeta(ev)+poStr+tLessonHTML+ftLessonHTML+tRangeHTML+tProfileHTML+(ev.suggest?'<div style="margin-top:4px;color:var(--gold);font-size:10px;font-weight:600">推奨詳細: '+ev.suggest+'</div>':'')+'<div style="margin-top:5px;color:var(--dim);font-size:10px;line-height:1.5">'+plainReviewText(ev.comment)+'</div>');
        html+='<div class="decision-row '+ev.quality+'"><div class="dr-action '+ev.quality+'">'+actLabel+'</div><div>'+coachHTML+detailHTML+'</div></div>';
      }
      html+='</details>';
    }
    html+='</div>';
  }
  // クリップボードコピーボタン
  html+='<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px">'
    +'<button onclick="copyHandHistory()" style="background:var(--panel2);color:var(--dim);border:1px solid var(--border);border-radius:8px;padding:7px 18px;font-size:11px;cursor:pointer;font-family:inherit">ハンド履歴をコピー</button>'
    +'<button onclick="copyEvaluationSnapshot()" style="background:var(--panel2);color:var(--dim);border:1px solid var(--border);border-radius:8px;padding:7px 18px;font-size:11px;cursor:pointer;font-family:inherit">評価JSON</button>'
    +'<button onclick="copyWallReviewPrompt()" style="background:var(--gold);color:#fff;border:1px solid var(--gold);border-radius:8px;padding:7px 18px;font-size:11px;font-weight:800;cursor:pointer;font-family:inherit">壁打ち用プロンプト</button>'
    +'</div>';
  $('analysis-content').innerHTML=html;
  // [Codex fix 2026-06-28] スマホでは主テーマと判断分析を先に読ませ、スキル棚卸は必要時に開く。
  document.querySelectorAll('.analysis-secondary-block').forEach(function(el){
    el.open=!window.matchMedia('(max-width:600px)').matches;
  });
  document.querySelectorAll('.analysis-street-block').forEach(function(el,idx){
    const mobile=window.matchMedia('(max-width:600px)').matches;
    el.open=!mobile||idx===0||el.dataset.issue==='1';
  });
  document.querySelectorAll('.coach-more').forEach(function(el){
    el.open=!window.matchMedia('(max-width:600px)').matches;
  });
  $('analysis-modal').classList.add('open');
  // 履歴から開いた場合: 「履歴に戻る」のみ。通常ゲームでは「次のハンドへ」のみ表示
  $('close-only').style.display=fromHistory?'':'none';
  $('close-analysis').style.display=fromHistory?'none':'';
  // コピー用データをグローバルに保持
  window._lastHR=hr;window._lastAN=an;
  return an; // セッション統計更新用
}
function buildHandHistoryText(includeContext){
  const hr=window._lastHR;const an=window._lastAN;
  if(!hr||!an)return '';
  const totalP=hr.players.filter(p=>p.active!==false).length||hr.players.length;
  const getPos=(p)=>hr.dealerIndex!=null?posLabel(hr.players.indexOf(p),hr.dealerIndex,totalP):'?';
  const human=hr.players.find(p=>p.isHuman);
  const humanPos=getPos(human);
  const hc=human.holeCards.map(c=>c.rank+c.suit).join('');
  function plainActionText(d){
    const isBet=d.action==='raise'&&d.street!=='preflop'&&d.toCall===0;
    if(d.street==='preflop'&&(d.action==='raise'||d.action==='allin')&&d.facingRaise){
      const n=(d.pfActionBetLevel||((d.pfRaiseCountBefore||1)+2));
      return (n>=5?'5BET':n===4?'4BET':'3BET')+' '+d.amount;
    }
    if(d.street==='preflop'&&d.action==='call'&&d.facingRaise&&(d.pfFacingBetLevel||0)>=4)return '4BETコール '+d.amount;
    return {fold:'フォールド',check:'チェック',call:'コール '+d.amount,raise:(isBet?'ベット':'レイズ')+' '+d.amount,allin:'オールイン '+d.amount}[d.action]||d.action;
  }
  let txt='=== ハンド #'+hr.handNum+' ===\n';
  // [Codex fix 2026-05-26] 外部レビュー用の文脈は目的だけを簡潔に渡す。
  if(includeContext)txt+='ゲーム文脈: '+(hr.tournamentContext&&hr.tournamentContext.enabled?'国内アミューズメント・チケット獲得トーナメント訓練':'海外ライブキャッシュ $2/$5 勝ち越し訓練')+'\n';
  txt+='プレイヤー数: '+totalP+'人 / BB: '+hr.bigBlind+'T / 想定スタック: '+(hr.tournamentContext&&hr.tournamentContext.enabled?hr.tournamentContext.stackBB+'BB':'約50BB以上')+'\n';
  if(hr.tournamentContext&&hr.tournamentContext.enabled){
    txt+='トーナメント文脈: '+tournamentContextText(hr.tournamentContext)+'\n';
    txt+='評価軸: '+tournamentAxisSummary(hr.tournamentContext,hr.tournamentContext.stackBB)+'\n';
    if(hr.tournamentContext.focusGoal)txt+='練習テーマ: '+hr.tournamentContext.focusLabel+' — '+hr.tournamentContext.focusGoal+'\n';
  }
  // [Claude fix 2026-05-23] シナリオモードのプリフロップストーリーを出力
  if(hr.pfStory&&hr.pfStory.narrative)txt+='プリフロップ: '+hr.pfStory.narrative+'\n';
  if(hr.scenarioQuality)txt+='シナリオ品質: '+trainingSpotQualityText(hr.scenarioQuality)+'\n';
  if(an.actualHandAudit)txt+='実ハンド混入監査: '+actualHandLeakAuditText(an.actualHandAudit)+'\n';
  if(an.premiseAudit&&(an.premiseAudit.issues.length||an.premiseAudit.warnings.length)){
    txt+='ソフト前提監査: '+an.premiseAudit.grade+' / '+an.premiseAudit.score+'pt\n';
    an.premiseAudit.issues.concat(an.premiseAudit.warnings).forEach(function(x){txt+='  - '+x.text+'\n';});
  }
  txt+='あなた['+humanPos+']: '+hc+'\n';
  // [Codex fix 2026-06-03] 壁打ちレビューが結果論に寄らないよう、公開情報として見えない相手ホールは伏せる。
  const reachedShowdown=!!(hr.community&&hr.community.length>=5&&hr.winners&&!hr.winners.some(w=>w.byFold));
  const publicOpps=hr.players.filter(p=>!p.isHuman&&p.holeCards&&p.holeCards.length&&!p.folded&&reachedShowdown);
  if(publicOpps.length){
    publicOpps.forEach(p=>{
      txt+=p.name+'['+getPos(p)+']: '+p.holeCards.map(c=>c.rank+c.suit).join('')+'\n';
    });
  }else{
    txt+='相手ハンド: 非公開（レンジ評価用。実ハンドを結果論に使わない）\n';
  }
  txt+='\nボード: '+hr.community.map(c=>c.rank+c.suit).join(' ')+'\n\n';
  // アクション履歴 (全プレイヤー・ストリート順)
  const streets=['preflop','flop','turn','river'];
  for(const st of streets){
    const stDecs=hr.decisions.filter(d=>d.street===st);
    if(stDecs.length===0)continue;
    txt+='\n'+st.toUpperCase()+'\n';
    if(st==='flop'&&hr.community.length>=3)txt+='  Board: '+hr.community.slice(0,3).map(c=>c.rank+c.suit).join(' ')+'\n';
    else if(st==='turn'&&hr.community.length>=4)txt+='  Board: '+hr.community.slice(0,4).map(c=>c.rank+c.suit).join(' ')+'\n';
    else if(st==='river'&&hr.community.length>=5)txt+='  Board: '+hr.community.map(c=>c.rank+c.suit).join(' ')+'\n';
    for(const d of stDecs){
      const aLabel=plainActionText(d);
      const dPos=d.position||(d.isHuman?humanPos:'?');
      const pLabel=d.isHuman?'あなた':(d.playerName||'AI');
      const coverTxt=d.coverLabel?' / Cover:'+d.coverLabel+(d.coverDeltaBB?' +'+d.coverDeltaBB+'BB':''):'';
      txt+='  '+pLabel+'['+dPos+']: '+aLabel+' (Pot:'+d.pot+coverTxt+')\n';
    }
  }
  txt+='\n結果: ';
  for(const w of hr.winners){
    const wPos=hr.dealerIndex!=null?posLabel(w.playerIdx!=null?w.playerIdx:hr.players.findIndex(p=>p.name===w.player.name),hr.dealerIndex,totalP):'?';
    txt+=(w.player.isHuman?'あなた':w.player.name+'['+wPos+']')+' +'+w.amount+(w.byFold?' (相手フォールド)':'')+'  ';
  }
  txt+='\nスコア: '+an.score+'/100 ('+an.grade+') — '+an.gradeLabel+'\n';
  if(an.liveCashScores&&an.liveCashScores.length){
    txt+='リングスキル: '+an.liveCashScores.map(function(s){return s.label+' '+s.grade+'('+s.score+'pt: '+s.note+')';}).join(' / ')+'\n';
  }
  if(an.tournamentScores&&an.tournamentScores.length){
    txt+='トーナメントスキル: '+an.tournamentScores.map(function(s){return s.label+' '+s.grade+'('+s.score+'pt: '+s.note+')';}).join(' / ')+'\n';
  }
  // 判断分析テキスト
  if(an.primaryLesson){
    txt+='主テーマ: '+primaryLessonText(an.primaryLesson)+'\n';
  }
  if(an.evals&&an.evals.length>0){
    txt+='\n=== 判断分析 ===\n';
    for(const ev of an.evals){
      const aLabel=plainActionText(ev);
      const qual={good:'✓',ok:'△',bad:'✗'}[ev.quality]||'';
      // HTMLタグを除去してプレーンテキスト化
      const comment=plainReviewText(ev.comment);
      const coach=coachReviewText(ev);
      txt+=qual+' ['+ev.street.toUpperCase()+'] '+aLabel+'\n';
      const meta=[];
      if(ev.position)meta.push('位置='+ev.position);
      if(ev.lineContext)meta.push('文脈='+ev.lineContext);
      if(ev.evalAxis)meta.push('判断軸='+ev.evalAxis);
      if(ev.equitySource)meta.push('EQ基準='+ev.equitySource);
      if(ev.axisTags&&ev.axisTags.length)meta.push('副軸='+ev.axisTags.join(','));
      if(ev.axisWeightNote)meta.push('軸補正='+ev.axisWeightNote);
      if(ev.liveCashSpotProfile)meta.push('リング文脈='+liveCashSpotProfileText(ev.liveCashSpotProfile));
      if(ev.liveCashSprProfile)meta.push('SPR文脈='+liveCashSprProfileText(ev.liveCashSprProfile));
      if(ev.liveCashInitiativeProfile)meta.push('主導権文脈='+liveCashInitiativeProfileText(ev.liveCashInitiativeProfile));
      if(ev.liveCashReraisedPotProfile)meta.push('3BET文脈='+liveCashReraisedPotProfileText(ev.liveCashReraisedPotProfile));
      if(ev.liveCashMultiwayProfile)meta.push('MW文脈='+liveCashMultiwayProfileText(ev.liveCashMultiwayProfile));
      if(ev.liveCashRiverDecisionProfile)meta.push('リバー金額='+liveCashRiverDecisionProfileText(ev.liveCashRiverDecisionProfile));
      if(ev.onePairProfile)meta.push('ワンペア監査='+onePairPressureProfileText(ev.onePairProfile));
      if(ev.tournamentPhaseAxis)meta.push('フェーズ軸='+ev.tournamentPhaseAxis);
      if(ev.phaseWeightNote)meta.push('フェーズ補正='+ev.phaseWeightNote);
      if(ev.bubbleProfile)meta.push('バブル立場='+tournamentBubbleProfileText(ev.bubbleProfile));
      if(ev.shortestOppStackBB!=null)meta.push('最短相手='+ev.shortestOppStackBB+'BB');
      if(ev.nextBBPressure)meta.push('BB接近='+ev.nextBBPressure);
      if(ev.bubbleIcmRange)meta.push('バブルICM表='+tournamentBubbleIcmRangeText(ev.bubbleIcmRange));
      if(ev.earlyProfile)meta.push('序盤参加='+tournamentEarlyProfileText(ev.earlyProfile));
      if(ev.earlyMultiwayProfile)meta.push('序盤MW='+tournamentEarlyMultiwayProfileText(ev.earlyMultiwayProfile));
      if(ev.earlyDeepSprProfile)meta.push('序盤深SPR='+tournamentEarlyDeepSprProfileText(ev.earlyDeepSprProfile));
      if(ev.middleProfile)meta.push('中盤帯='+tournamentMiddleProfileText(ev.middleProfile));
      if(ev.finalTableProfile)meta.push('FT評価='+tournamentFinalTableProfileText(ev.finalTableProfile));
      if(ev.finalTableProfile&&ev.finalTableProfile.stackRole)meta.push('FT立場='+ev.finalTableProfile.stackRole);
      if(ev.finalTableProfile&&ev.finalTableProfile.collisionProfile)meta.push('FT衝突相手='+ev.finalTableProfile.collisionProfile.opponent+(ev.finalTableProfile.collisionProfile.oppBB?' '+ev.finalTableProfile.collisionProfile.oppBB+'BB':''));
      if(ev.finalTableRangeProfile)meta.push('FTレンジ表='+tournamentFinalTableRangeProfileText(ev.finalTableRangeProfile));
      if(ev.finalTablePostflopProfile)meta.push('FTポストF='+tournamentFinalTablePostflopProfileText(ev.finalTablePostflopProfile));
      if(ev.finalTableLearningPoint)meta.push('FT学習='+tournamentFinalTableLearningPointText(ev.finalTableLearningPoint));
      if(ev.headsUpProfile)meta.push('HU評価='+tournamentHeadsUpProfileText(ev.headsUpProfile));
      if(ev.headsUpRiverProfile)meta.push('HUリバー='+tournamentHeadsUpRiverProfileText(ev.headsUpRiverProfile));
      if(ev.toCall>0)meta.push('必要コール='+ev.toCall);
      if(ev.potOdds>0)meta.push('必要EQ='+Math.round(ev.potOdds*100)+'%');
      if(ev.strategyMix)meta.push('推奨頻度='+ev.strategyMix);
      if(ev.gtoTheory){
        if(ev.gtoTheory.boardClass)meta.push('GTOボード分類='+ev.gtoTheory.boardClass);
        if(ev.gtoTheory.rangeUpdate)meta.push('GTOレンジ更新='+ev.gtoTheory.rangeUpdate);
        if(ev.gtoTheory.liveAdjustment)meta.push('実戦補正='+ev.gtoTheory.liveAdjustment);
      }
      if(ev.rawEqPct!=null)meta.push('RawEQ='+ev.rawEqPct+'%');
      if(ev.effectiveEqPct!=null)meta.push('実効EQ='+ev.effectiveEqPct+'%');
      if(ev.realizationPct!=null)meta.push('実現率='+ev.realizationPct+'%');
      if(ev.rangeAdv)meta.push('レンジ優位='+ev.rangeAdv);
      if(ev.nutAdv)meta.push('ナッツ優位='+ev.nutAdv);
      if(ev.tournamentRangeHint)meta.push('Tレンジ='+ev.tournamentRangeHint);
      if(ev.tournamentRangeProfile)meta.push('Tレンジ判定='+tournamentRangeProfileText(ev.tournamentRangeProfile));
      if(ev.deduction>0)meta.push('減点='+ev.deduction+'pt');
      txt+='   コーチコメント: '+coach+'\n';
      if(comment&&comment!==coach)txt+='   詳細説明: '+comment+'\n';
      if(meta.length)txt+='   詳細メタ: '+meta.join(' / ')+'\n';
    }
  }
  return txt;
}

function _copyTextToClipboard(txt,successMessage){
  if(!txt){toast('コピーする内容がありません','warn',2500);return;}
  // file://でもコピーできるフォールバック
  try{
    const ta=document.createElement('textarea');
    ta.value=txt;ta.style.cssText='position:fixed;top:-9999px;left:-9999px;opacity:0';
    document.body.appendChild(ta);ta.select();ta.setSelectionRange(0,99999);
    const ok=document.execCommand('copy');
    document.body.removeChild(ta);
    toast(ok?successMessage:'コピーできませんでした',ok?'info':'warn',2500);
  }catch(e){toast('コピー失敗: '+e.message,'warn',2500);}
}

function copyHandHistory(){
  _copyTextToClipboard(buildHandHistoryText(false),'ハンド履歴をコピーしました');
}

function buildWallReviewPrompt(){
  const base=buildHandHistoryText(false);
  if(!base)return '';
  return [
    'あなたは海外ライブキャッシュ $2/$5 で勝つためのポーカーコーチ兼GTOレビュー担当です。',
    '以下は Fish Tank Poker の自動評価付きハンド履歴です。このソフトの目的は、海外カジノの$2/$5キャッシュゲームで勝てる下地を作ることです。',
    '',
    'レビュー方針:',
    '- ソフトの評価が妥当か、甘すぎるか、厳しすぎるかを検証してください。',
    '- GTO理論だけでなく、海外ライブ$2/$5の実戦傾向も考慮してください。',
    '- プリフロップは「唯一の正解」と断定せず、Fold / Call / 3bet のミックス頻度と実戦向け推奨を示してください。',
    '- ポストフロップはRaw EQだけで判断せず、実効EQ、エクイティ実現率、ポジション、マルチウェイ、レンジ優位、ナッツ優位を確認してください。',
    '- リバーのコール/フォールドは、相手のポジション、ベットサイズ、ライン、ライブ$2/$5でのバリュー過多傾向を重視してください。',
    '- BETやRAISEを推奨する場合は、推奨サイズもBBまたはポット比で示してください。',
    '- 最後に「プレイヤーへの実戦アドバイス」と「ソフト評価ロジックの改善案」を分けて出してください。',
    '',
    '出力形式:',
    '1. ソフト評価の妥当性',
    '2. ストリート別レビュー',
    '3. 推奨ラインとサイズ',
    '4. プレイヤー採点',
    '5. ソフト改善案',
    '',
    base
  ].join('\n');
}

// [Codex fix 2026-05-26] 壁打ちプロンプトをフロップトレーニング対応に上書き。
function buildWallReviewPrompt(){
  const base=buildHandHistoryText(false);
  if(!base)return '';
  const latest=window._lastHR||(game&&game.handHistory&&game.handHistory[0]);
  const scenarioNote=latest&&latest.pfStory
    ? [
        '注意: このハンドはフロップトレーニングモードです。',
        'プリフロップはユーザー操作ではなく、ソフトが作成したシナリオです。',
        '採点は主にフロップ以降を対象にしつつ、プリフロップ参加レンジやストーリーが海外ライブ$2/$5実戦として不自然なら「ソフト改善案」で明確に指摘してください。'
      ].join('\n')
    : '';
  const tournamentNote=latest&&latest.tournamentContext&&latest.tournamentContext.enabled
    ? [
        '注意: このハンドは国内アミューズメントのチケット獲得を想定したトーナメントモードです。',
        'BBアンティ、有効スタックBB、残り人数、通過枠、バブル圧を考慮して、chipEVだけでなくトーナメントEV/サテライトEVの観点でも検証してください。',
        'この局面の評価軸: '+tournamentAxisSummary(latest.tournamentContext,latest.tournamentContext.stackBB),
        latest.tournamentContext.focusLabel?'練習テーマ: '+latest.tournamentContext.focusLabel+'。'+latest.tournamentContext.focusReview:'',
        'リングゲームと違い、オープンサイズ・BB防衛・コールレンジ・3bet jam/reshoveの価値が変わる点を明確にレビューしてください。'
      ].join('\n')
    : '';
  return [
    latest&&latest.tournamentContext&&latest.tournamentContext.enabled
      ?'あなたは国内アミューズメントポーカーの大型大会チケット獲得を目指すトーナメントコーチ兼GTO/ICMレビュー担当です。'
      :'あなたは海外ライブキャッシュ $2/$5 で勝つためのポーカーコーチ兼GTOレビュー担当です。',
    latest&&latest.tournamentContext&&latest.tournamentContext.enabled
      ?'以下は Fish Tank Poker の自動評価付きトーナメントハンド履歴です。このソフトの目的は、国内アミューズメントのチケット戦・小規模トーナメントで勝ち上がる下地を作ることです。'
      :'以下は Fish Tank Poker の自動評価付きハンド履歴です。このソフトの目的は、海外カジノの$2/$5キャッシュゲームで勝てる下地を作ることです。',
    scenarioNote,
    tournamentNote,
    '',
    'レビュー方針:',
    '- ソフトの評価が妥当か、甘すぎるか、厳しすぎるかを検証してください。',
    latest&&latest.tournamentContext&&latest.tournamentContext.enabled?'- GTO理論だけでなく、国内アミューズメントのチケット戦・小規模トーナメントの実戦傾向も考慮してください。':'- GTO理論だけでなく、海外ライブ$2/$5の実戦傾向も考慮してください。',
    latest&&latest.tournamentContext&&latest.tournamentContext.enabled?'- トーナメントモードではBBアンティ、有効BB、ICM、バブル圧、チケット獲得率を重視してください。':'',
    '- 相手の実ハンドが表示されている場合でも、それはショーダウン確認用です。評価は実ハンドを当てにせず、相手のポジション・ライン・サイズから推定されるレンジで行ってください。',
    '- 「実ハンド混入監査」がFAILなら、ソフト評価ロジックに相手の非公開ホールカード由来の情報が混ざっている可能性を優先的に指摘してください。',
    '- プリフロップは「唯一の正解」と断定せず、Fold / Call / 3bet のミックス頻度と実戦向け推奨を示してください。',
    '- フロップトレーニングモードでは、プリフロップをユーザーのミスとして採点しすぎず、シナリオ生成の妥当性とポストフロップ判断を分けてレビューしてください。',
    '- ポストフロップはRaw EQだけで判断せず、実効EQ、エクイティ実現率、ポジション、マルチウェイ、レンジ優位、ナッツ優位を確認してください。',
    '- リバーのコール/フォールドは、相手のポジション、ベットサイズ、ライン、ライブ$2/$5でのバリュー過多傾向を重視してください。',
    '- BETやRAISEを推奨する場合は、推奨サイズもBBまたはポット比で示してください。',
    '- 最後に「プレイヤーへの実戦アドバイス」と「ソフト評価ロジックの改善案」を分けて出してください。',
    '',
    '出力形式:',
    '1. ソフト評価の妥当性',
    '2. ストリート別レビュー',
    '3. 推奨ラインとサイズ',
    '4. プレイヤー採点',
    '5. ソフト改善案',
    '',
    base
  ].filter(Boolean).join('\n');
}

function copyWallReviewPrompt(){
  _copyTextToClipboard(buildWallReviewPrompt(),'壁打ち用プロンプトをコピーしました');
}

function getDebugHand(handNum){
  if(game&&game.handHistory&&game.handHistory.length){
    if(handNum!=null){
      const found=game.handHistory.find(function(h){return h.handNum===+handNum;});
      if(found)return found;
    }
    return game.handHistory[0];
  }
  return window._lastHR||null;
}
function evaluationSnapshot(hr,an){
  hr=hr||window._lastHR||getDebugHand();
  if(!hr)return null;
  an=an||analyzeHand(hr);
  const totalP=hr.players.filter(function(p){return p.active!==false;}).length||hr.players.length;
  const human=hr.players.find(function(p){return p.isHuman;});
  const humanIdx=hr.players.indexOf(human);
  const pos=human?posLabel(humanIdx,hr.dealerIndex,totalP):'?';
  return{
    handNum:hr.handNum,
    mode:hr.tournamentContext&&hr.tournamentContext.enabled?'tournament':(hr.scenario?'scenario':'normal'),
    players:totalP,
    bb:hr.bigBlind,
    hero:{
      position:pos,
      cards:human&&human.holeCards?human.holeCards.map(function(c){return c.rank+c.suit;}):[],
      folded:!!(human&&human.folded),
      totalInvested:human?human.totalInvested:0
    },
    board:hr.community.map(function(c){return c.rank+c.suit;}),
    score:an.score,
    grade:an.grade,
    pfScore:an.pfScore,
    poScore:an.poScore,
    sawFlop:an.sawFlop,
    liveCashScores:an.liveCashScores||null,
    tournamentScores:an.tournamentScores||null,
    primaryLesson:an.primaryLesson||null,
    premiseAudit:an.premiseAudit||null,
    actualHandAudit:an.actualHandAudit||null,
    scenarioQuality:hr.scenarioQuality||null,
    tournamentContext:hr.tournamentContext||null,
    evaluations:an.evals.map(function(e){
      return{
        street:e.street,
        action:e.action,
        amount:e.amount,
        position:e.position,
        lineContext:e.lineContext||'',
        evalAxis:e.evalAxis||'',
        hiddenInfoPolicy:e.hiddenInfoPolicy||'',
        equitySource:e.equitySource||'',
        axisTags:e.axisTags||[],
        axisWeightNote:e.axisWeightNote||'',
        liveCashSpotProfile:e.liveCashSpotProfile||null,
        liveCashSpotWeightNote:e.liveCashSpotWeightNote||'',
        liveCashSprProfile:e.liveCashSprProfile||null,
        liveCashSprWeightNote:e.liveCashSprWeightNote||'',
        liveCashInitiativeProfile:e.liveCashInitiativeProfile||null,
        liveCashInitiativeWeightNote:e.liveCashInitiativeWeightNote||'',
        liveCashReraisedPotProfile:e.liveCashReraisedPotProfile||null,
        liveCashReraisedPotWeightNote:e.liveCashReraisedPotWeightNote||'',
        liveCashMultiwayProfile:e.liveCashMultiwayProfile||null,
        liveCashMultiwayWeightNote:e.liveCashMultiwayWeightNote||'',
        liveCashRiverDecisionProfile:e.liveCashRiverDecisionProfile||null,
        liveCashRiverDecisionWeightNote:e.liveCashRiverDecisionWeightNote||'',
        boardTextureProfile:e.boardTextureProfile||null,
        boardTextureMixProfile:e.boardTextureMixProfile||null,
        boardTextureSizeProfile:e.boardTextureSizeProfile||null,
        boardTextureTransitionProfile:e.boardTextureTransitionProfile||null,
        boardTextureTransitionWeightNote:e.boardTextureTransitionWeightNote||'',
        rangeNutAdvantageProfile:e.rangeNutAdvantageProfile||null,
        rangeNutAdvantageWeightNote:e.rangeNutAdvantageWeightNote||'',
        rangeActionUpdateProfile:e.rangeActionUpdateProfile||null,
        rangeActionUpdateWeightNote:e.rangeActionUpdateWeightNote||'',
        postflopBetPurposeProfile:e.postflopBetPurposeProfile||null,
        postflopBetPurposeWeightNote:e.postflopBetPurposeWeightNote||'',
        postflopRaisePlanProfile:e.postflopRaisePlanProfile||null,
        postflopRaisePlanWeightNote:e.postflopRaisePlanWeightNote||'',
        postflopBarrelPlanProfile:e.postflopBarrelPlanProfile||null,
        postflopBarrelPlanWeightNote:e.postflopBarrelPlanWeightNote||'',
        postflopDefensePlanProfile:e.postflopDefensePlanProfile||null,
        postflopDefensePlanWeightNote:e.postflopDefensePlanWeightNote||'',
        postflopCallFuturePlanProfile:e.postflopCallFuturePlanProfile||null,
        postflopCallFuturePlanWeightNote:e.postflopCallFuturePlanWeightNote||'',
        onePairProfile:e.onePairProfile||null,
        onePairWeightNote:e.onePairWeightNote||'',
        tournamentPhaseAxis:e.tournamentPhaseAxis||'',
        phaseWeightNote:e.phaseWeightNote||'',
        bubbleProfile:e.bubbleProfile||null,
        bubbleIcmRange:e.bubbleIcmRange||null,
        earlyProfile:e.earlyProfile||null,
        earlyMultiwayProfile:e.earlyMultiwayProfile||null,
        earlyDeepSprProfile:e.earlyDeepSprProfile||null,
        middleProfile:e.middleProfile||null,
        finalTableProfile:e.finalTableProfile||null,
        finalTableRangeProfile:e.finalTableRangeProfile||null,
        finalTablePostflopProfile:e.finalTablePostflopProfile||null,
        finalTablePostflopWeightNote:e.finalTablePostflopWeightNote||'',
        finalTableLearningPoint:e.finalTableLearningPoint||null,
        headsUpProfile:e.headsUpProfile||null,
        headsUpRiverProfile:e.headsUpRiverProfile||null,
        headsUpRiverWeightNote:e.headsUpRiverWeightNote||'',
        stackRank:e.stackRank||null,
        shortestOppStackBB:e.shortestOppStackBB,
        bbInHands:e.bbInHands,
        nextBBPressure:e.nextBBPressure||'',
        quality:e.quality,
        deduction:e.deduction||0,
        coachComment:coachReviewText(e),
        gtoTheory:e.gtoTheory||null,
        suggest:e.suggest||'',
        strategyMix:e.strategyMix||'',
        rawEqPct:e.rawEqPct,
        effectiveEqPct:e.effectiveEqPct,
        realizationPct:e.realizationPct,
        rangeAdv:e.rangeAdv,
        nutAdv:e.nutAdv,
        tournamentRangeProfile:e.tournamentRangeProfile||null,
        tournamentRangeHint:e.tournamentRangeHint||'',
        evLoss:e.evLoss,
        comment:(e.comment||'').replace(/<[^>]+>/g,'')
      };
    })
  };
}
function rerunHandAnalysis(handNum,openModal){
  const hr=getDebugHand(handNum);
  if(!hr){
    if(typeof toast==='function')toast('再評価できるハンド履歴がありません','info',3000);
    return null;
  }
  const an=openModal===false?analyzeHand(hr):showAnalysis(hr,true);
  window._lastHR=hr;
  window._lastAN=an;
  const snap=evaluationSnapshot(hr,an);
  console.log('Fish Tank re-analysis',snap);
  return snap;
}
function copyEvaluationSnapshot(){
  const snap=evaluationSnapshot(window._lastHR,window._lastAN);
  if(!snap){
    if(typeof toast==='function')toast('コピーできる評価がありません','info',2500);
    return;
  }
  _copyTextToClipboard(JSON.stringify(snap,null,2),'評価JSONをコピーしました');
}

function _historyHTML(){
  if(!game||!game.handHistory.length)return '<p style="color:var(--dim);font-size:11px;">まだハンドがありません</p>';
  return game.handHistory.slice(0,20).map(function(h){
    const hu=h.players.find(function(p){return p.isHuman;});
    const won=h.winners.some(function(w){return w.player.isHuman;});
    const wa=h.winners.filter(function(w){return w.player.isHuman;}).reduce(function(s,w){return s+w.amount;},0);
    const pr=wa-hu.totalInvested;
    return '<div class="hand-history-item" data-hand="'+h.handNum+'">'
      +'<div class="hh-title">Hand #'+h.handNum+' | Pot '+h.pot+'</div>'
      +'<div class="'+(pr>=0?'hh-win':'hh-loss')+'">'+(won?'+'+pr+' 勝利':'-'+hu.totalInvested+' 敗北')+'</div>'
      +'<div style="font-size:10px;color:var(--dim)">'+h.community.slice(0,3).map(function(c){return c.rank+c.sym;}).join(' ')+'</div>'
      +'</div>';
  }).join('');
}
function updateHistory(){
  var html=_historyHTML();
  [$('tab-history'),$('stab-history')].forEach(function(el){if(el)el.innerHTML=html;});
}
// 履歴クリックは event delegation で処理
document.addEventListener('click',function(e){
  var item=e.target.closest('.hand-history-item');
  if(!item)return;
  var rec=game&&game.handHistory.find(function(h){return h.handNum===+item.dataset.hand;});
  if(rec)showAnalysis(rec,true); // fromHistory=true → 閉じるだけ（新ハンドなし）
});

// ========== セッション統計 & 傾向分析 (Deep Analysis v2) ==========
var _STATS_KEY='yohe_holdem_stats_v3';
var _statsDef={
  hands:0, vpip:0, pfr:0, foldPF:0,
  sawFlop:0, foldFlop:0, checkFoldFlop:0,
  scores:[], badDec:0, totalDec:0,
  pfScores:[],   // プリフロップスコア (全ハンド)
  poScores:[],   // ポストフロップスコア (フロップ到達ハンドのみ)
  // ポジション別 (キー=ポジション名: {h:ハンド数,v:VPIP,p:PFR})
  byPos:{},
  // CBet: PFRとしてフロップでベット
  cbet:{opp:0,bet:0},
  // Fold to CBet: 相手CBetにフォールド
  fToCbet:{opp:0,fold:0},
  // WTSD/W$SD
  wtsdSaw:0, wtsdWent:0, wsdWent:0, wsdWon:0,
  // AF (アグレッション・ファクター): (bet+raise)/call ポストフロップ
  afNum:0, afDen:0,
  // リンプ (非BB/SBでのコールオープン)
  limp:0, limpOpp:0,
  // 3BET
  threeBet:0, threeBetOpp:0,
  // スチール (BTN/CO/SBからのオープン)
  steal:0, stealOpp:0
};
var sessionStats=(function(){
  try{
    var saved=localStorage.getItem(_STATS_KEY);
    if(saved){
      var parsed=JSON.parse(saved);
      // マージ: 新フィールドがなければデフォルト補完
      return Object.assign({},_statsDef,parsed,{scores:parsed.scores||[],pfScores:parsed.pfScores||[],poScores:parsed.poScores||[],byPos:parsed.byPos||{},cbet:parsed.cbet||{opp:0,bet:0},fToCbet:parsed.fToCbet||{opp:0,fold:0},limp:parsed.limp||0,limpOpp:parsed.limpOpp||0,threeBet:parsed.threeBet||0,threeBetOpp:parsed.threeBetOpp||0,steal:parsed.steal||0,stealOpp:parsed.stealOpp||0});
    }
  }catch(e){}
  return Object.assign({},_statsDef,{scores:[],byPos:{}});
})();

function _saveStats(){
  try{localStorage.setItem(_STATS_KEY,JSON.stringify(sessionStats));}catch(e){}
}

function updateSessionStats(hr,an){
  sessionStats.hands++;
  var human=hr.players.find(function(p){return p.isHuman;});

  // ---- プリフロップ ----
  var pfDecs=hr.decisions.filter(function(d){return d.isHuman&&d.street==='preflop';});
  var myPos='MP';
  var wasRaiserPF=false;
  if(pfDecs.length>0){
    myPos=pfDecs[0].position||'MP';
    if(!sessionStats.byPos[myPos]) sessionStats.byPos[myPos]={h:0,v:0,p:0};
    sessionStats.byPos[myPos].h++;
    var lastPF=pfDecs[pfDecs.length-1];
    if(lastPF.action==='raise'||lastPF.action==='call'||lastPF.action==='allin'){
      sessionStats.vpip++;
      sessionStats.byPos[myPos].v++;
      if(lastPF.action==='raise'||lastPF.action==='allin'){
        sessionStats.pfr++;
        sessionStats.byPos[myPos].p++;
        wasRaiserPF=true;
      }
    } else if(lastPF.action==='fold'){
      sessionStats.foldPF++;
    }
    // 3BET: raise when facing a raise preflop
    var facingRaisePF=pfDecs.find(function(d){return d.facingRaise;});
    if(facingRaisePF){sessionStats.threeBetOpp++;if(facingRaisePF.action==='raise'||facingRaisePF.action==='allin')sessionStats.threeBet++;}
    // Steal: BTN/CO/SB open raise
    var pos2=myPos.toUpperCase();
    var isStealPos=(pos2==='BTN'||pos2==='CO'||pos2==='SB');
    var openDec=pfDecs.find(function(d){return !d.facingRaise;});
    if(isStealPos&&openDec){sessionStats.stealOpp++;if(openDec.action==='raise'||openDec.action==='allin')sessionStats.steal++;}
    // Limp: non-BB, non-SB call without facing a raise
    var isBlind=(pos2==='BB'||pos2==='SB');
    var limpDec=pfDecs.find(function(d){return !d.facingRaise&&d.toCall>0&&d.action==='call';});
    if(!isBlind&&limpDec){sessionStats.limpOpp++;sessionStats.limp++;}
  }

  // ---- フロップ ----
  var flopDecs=hr.decisions.filter(function(d){return d.isHuman&&d.street==='flop';});
  if(flopDecs.length>0){
    sessionStats.sawFlop++;
    sessionStats.wtsdSaw++;
    if(flopDecs.some(function(d){return d.action==='fold';})) sessionStats.foldFlop++;
    if(flopDecs.length>=2&&flopDecs[0].action==='check'&&flopDecs[1].action==='fold') sessionStats.checkFoldFlop++;

    // CBet: PFRとしてフロップ最初のアクションがベット
    if(wasRaiserPF){
      sessionStats.cbet.opp++;
      var ff=flopDecs[0];
      if(ff&&(ff.action==='raise'||ff.action==='allin')) sessionStats.cbet.bet++;
    }
    // Fold to CBet: 非PFRがフロップでベットに直面してフォールド
    if(!wasRaiserPF){
      var facedBet=flopDecs.some(function(d){return d.toCall>0;});
      if(facedBet){
        sessionStats.fToCbet.opp++;
        if(flopDecs.some(function(d){return d.toCall>0&&d.action==='fold';})) sessionStats.fToCbet.fold++;
      }
    }
  }

  // ---- ターン + リバー ----
  var postDecs=hr.decisions.filter(function(d){return d.isHuman&&d.street!=='preflop';});
  postDecs.forEach(function(d){
    if(d.action==='raise'||d.action==='allin') sessionStats.afNum++;
    else if(d.action==='call') sessionStats.afDen++;
  });

  // ---- WTSD / W$SD ----
  // went to showdown = 実際にショーダウンが起き(byFold=false)、自分が降りていない
  if(sessionStats.wtsdSaw>0&&flopDecs.length>0){
    var isActualSD=hr.winners.length>0&&!hr.winners[0].byFold;
    var humanFolded=human&&human.folded;
    if(isActualSD&&!humanFolded){
      sessionStats.wtsdWent++;
      sessionStats.wsdWent++;
      if(hr.winners.some(function(w){return w.player&&w.player.isHuman;})) sessionStats.wsdWon++;
    }
  }

  // ---- スコア & ミス ----
  if(an&&an.score!=null) sessionStats.scores.push(an.score);
  if(an&&an.pfScore!=null) sessionStats.pfScores.push(an.pfScore);
  if(an&&an.sawFlop&&an.poScore!=null) sessionStats.poScores.push(an.poScore);
  if(an&&an.evals){
    sessionStats.badDec+=an.evals.filter(function(e){return e.quality==='bad';}).length;
    sessionStats.totalDec+=an.evals.length;
  }

  _saveStats();
  renderTrends();
}

function renderTrends(){
  var targets=[$('trends-content'),$('stab-trends-content')].filter(Boolean);
  if(targets.length===0)return;
  var n=sessionStats.hands;

  if(n===0){
    targets.forEach(function(t){t.innerHTML='<p style="color:var(--dim);font-size:11px;padding:4px 0">ハンドをプレーすると傾向が表示されます</p>';});
    return;
  }

  // ---- サンプルサイズ注意書き ----
  var sampleNote='';
  if(n<5){
    sampleNote='<div style="background:rgba(122,96,16,.10);border:1px solid rgba(122,96,16,.25);border-radius:7px;padding:6px 8px;font-size:10px;color:var(--gold);margin-bottom:8px;line-height:1.45">⚠ まだ'+n+'ハンド。<strong>10ハンド以上</strong>で傾向が安定してきます。現在の数値は参考程度です。</div>';
  }else if(n<10){
    sampleNote='<div style="background:rgba(122,96,16,.06);border-radius:6px;padding:5px 7px;font-size:10px;color:var(--gold);margin-bottom:6px">'+n+'ハンド — まだサンプルが少なく傾向は参考程度（目安: 30+ハンド）</div>';
  }else if(n<30){
    sampleNote='<div style="font-size:9px;color:var(--dim);margin-bottom:5px">'+n+'ハンド（30以上で深い分析が可能になります）</div>';
  }

  // ---- 計算 ----
  var vpipPct=Math.round(sessionStats.vpip/n*100);
  var pfrPct=Math.round(sessionStats.pfr/n*100);
  var pfrVpip=sessionStats.vpip>0?Math.round(sessionStats.pfr/sessionStats.vpip*100):0;
  var cfPct=sessionStats.sawFlop>0?Math.round(sessionStats.checkFoldFlop/sessionStats.sawFlop*100):0;
  var avgScore=sessionStats.scores.length?Math.round(sessionStats.scores.reduce(function(a,b){return a+b;},0)/sessionStats.scores.length):0;
  var avgPF=sessionStats.pfScores.length?Math.round(sessionStats.pfScores.reduce(function(a,b){return a+b;},0)/sessionStats.pfScores.length):0;
  var avgPO=sessionStats.poScores.length?Math.round(sessionStats.poScores.reduce(function(a,b){return a+b;},0)/sessionStats.poScores.length):0;
  var mistakeRate=sessionStats.totalDec>0?Math.round(sessionStats.badDec/sessionStats.totalDec*100):0;
  var cbetPct=sessionStats.cbet.opp>0?Math.round(sessionStats.cbet.bet/sessionStats.cbet.opp*100):-1;
  var fToCbetPct=sessionStats.fToCbet.opp>0?Math.round(sessionStats.fToCbet.fold/sessionStats.fToCbet.opp*100):-1;
  var wtsdPct=sessionStats.wtsdSaw>0?Math.round(sessionStats.wtsdWent/sessionStats.wtsdSaw*100):-1;
  var wsdPct=sessionStats.wsdWent>0?Math.round(sessionStats.wsdWon/sessionStats.wsdWent*100):-1;
  var af=sessionStats.afDen>0?Math.round(sessionStats.afNum/sessionStats.afDen*10)/10:(sessionStats.afNum>0?'∞':-1);

  // ---- スコアスパークライン ----
  var sparkline='';
  if(sessionStats.scores.length>=3){
    var ss=sessionStats.scores.slice(-20);
    var svgW=150,svgH=28;
    var mn=Math.min.apply(null,ss),mx=Math.max.apply(null,ss);
    var rng=mx-mn||1;
    var pts=ss.map(function(s,i){
      var x=(i/(ss.length-1))*(svgW-6)+3;
      var y=svgH-3-(s-mn)/rng*(svgH-6);
      return x.toFixed(1)+','+y.toFixed(1);
    }).join(' ');
    var lastS=ss[ss.length-1];
    var lx=((ss.length-1)/(ss.length-1))*(svgW-6)+3;
    var ly=svgH-3-(lastS-mn)/rng*(svgH-6);
    var trendColor=ss.length>=4&&ss[ss.length-1]>=ss[ss.length-4]?'var(--green)':'var(--accent)';
    sparkline='<div style="margin-bottom:8px">';
    sparkline+='<div style="font-size:9px;color:var(--dim);margin-bottom:3px">総合スコア推移（直近'+ss.length+'手の個別スコア）</div>';
    sparkline+='<div style="display:flex;align-items:center;gap:8px">';
    sparkline+='<svg width="'+svgW+'" height="'+svgH+'" style="background:var(--panel2);border-radius:4px;border:1px solid var(--border);flex-shrink:0">';
    sparkline+='<polyline points="'+pts+'" fill="none" stroke="'+trendColor+'" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>';
    sparkline+='<circle cx="'+lx.toFixed(1)+'" cy="'+ly.toFixed(1)+'" r="2.5" fill="'+trendColor+'"/>';
    sparkline+='</svg>';
    sparkline+='<span style="font-size:11px;font-weight:800;color:'+trendColor+'">'+lastS+'pt</span>';
    sparkline+='</div></div>';
  }

  // ---- スタットグリッド ----
  function statCell(lbl,val,ok){
    var c=ok===true?'var(--green)':ok===false?'var(--red)':'var(--dim)';
    var disp=val===-1?'--':val;
    return '<div style="background:var(--panel2);border-radius:6px;padding:5px 3px;text-align:center"><div style="font-size:9px;color:var(--dim);line-height:1.2">'+lbl+'</div><div style="font-size:13px;font-weight:800;color:'+c+'">'+disp+'</div></div>';
  }
  // PF/PostF スコア表示 (2セル)
  var poN=sessionStats.poScores.length;
  var pfN=sessionStats.pfScores.length;
  var scoreBand='<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:4px">';
  scoreBand+='<div style="background:var(--panel2);border-radius:6px;padding:5px 6px;border-left:2px solid var(--accent)">';
  scoreBand+='<div style="font-size:9px;color:var(--dim)">PF スコア ('+pfN+'手)</div>';
  scoreBand+='<div style="font-size:14px;font-weight:800;color:'+(avgPF>=80?'var(--green)':avgPF>=65?'var(--gold)':'var(--red)')+'">'+( pfN>0?avgPF+'pt':'--')+'</div></div>';
  scoreBand+='<div style="background:var(--panel2);border-radius:6px;padding:5px 6px;border-left:2px solid '+(poN>=5?'var(--accent)':'var(--border)')+'">';
  scoreBand+='<div style="font-size:9px;color:var(--dim)">PostF スコア ('+poN+'手)</div>';
  scoreBand+='<div style="font-size:14px;font-weight:800;color:'+(poN===0?'var(--dim)':avgPO>=80?'var(--green)':avgPO>=65?'var(--gold)':'var(--red)')+'">'+( poN>0?avgPO+'pt':'--')+'</div></div>';
  scoreBand+='</div>';
  // 3BET% / Steal% / Limp%
  var threeBetPct=sessionStats.threeBetOpp>0?Math.round(sessionStats.threeBet/sessionStats.threeBetOpp*100):-1;
  var stealPct=sessionStats.stealOpp>0?Math.round(sessionStats.steal/sessionStats.stealOpp*100):-1;
  var limpPct=sessionStats.limpOpp>0?Math.round(sessionStats.limp/sessionStats.limpOpp*100):0;
  var g1='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:4px">';
  g1+=statCell('VPIP',vpipPct+'%',vpipPct>=14&&vpipPct<=38);
  g1+=statCell('PFR',pfrPct+'%',pfrPct>=9&&pfrPct<=25);
  g1+=statCell('3BET%',threeBetPct>=0?threeBetPct+'%':-1,threeBetPct>=0?(threeBetPct>=5&&threeBetPct<=14):null);
  g1+=statCell('Steal%',stealPct>=0?stealPct+'%':-1,stealPct>=0?(stealPct>=35&&stealPct<=65):null);
  g1+='</div>';
  var g2='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:4px">';
  g2+=statCell('CBet',cbetPct>=0?cbetPct+'%':-1,cbetPct>=0?(cbetPct>=50&&cbetPct<=82):null);
  g2+=statCell('F/CBet',fToCbetPct>=0?fToCbetPct+'%':-1,fToCbetPct>=0?(fToCbetPct>=35&&fToCbetPct<=60):null);
  g2+=statCell('WTSD',wtsdPct>=0?wtsdPct+'%':-1,wtsdPct>=0?(wtsdPct>=20&&wtsdPct<=32):null);
  g2+=statCell('W$SD',wsdPct>=0?wsdPct+'%':-1,wsdPct>=0?(wsdPct>=48):null);
  g2+='</div>';
  var mistakeRateVal=sessionStats.totalDec>0?Math.round(sessionStats.badDec/sessionStats.totalDec*100):0;
  var g3='<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;margin-bottom:8px">';
  g3+=statCell('AF',typeof af==='number'&&af>=0?af+'':'--',typeof af==='number'&&af>=0?(af>=1.5&&af<=4.5):null);
  g3+=statCell('Limp%',sessionStats.limpOpp>0?limpPct+'%':'--',sessionStats.limpOpp>0?(limpPct<=10):null);
  g3+=statCell('Hands',n,true);
  g3+=statCell('ミス%',sessionStats.totalDec>0?mistakeRateVal+'%':-1,sessionStats.totalDec>0?(mistakeRateVal<=20):null);
  g3+='</div>';

  // ---- リーク検出エンジン ----
  var leaks=[];
  var tierCol={critical:'var(--red)',warn:'var(--orange)',improve:'var(--accent)',good:'var(--green)'};
  var tierLbl={critical:'❗ CRITICAL',warn:'⚠ WARNING',improve:'💡 IMPROVEMENT',good:'✓ GOOD'};

  // CRITICAL (n>=5)
  if(n>=5){
    if(vpipPct>50) leaks.push({t:'critical',m:'VPIP '+vpipPct+'% — プリフロップが広すぎます（目標: 18〜35%）。弱いハンドはフォールドしてレンジを絞りましょう。'});
    else if(vpipPct<8) leaks.push({t:'critical',m:'VPIP '+vpipPct+'% — 極端にタイトです（目標: 18〜35%）。ポジション優位を活かしてもう少し広くプレーしましょう。'});
    if(cfPct>60&&sessionStats.sawFlop>=5) leaks.push({t:'critical',m:'CheckFold率 '+cfPct+'% — フロップでチェック後にフォールドしすぎです。チェックするならコールの準備を持って。'});
  }
  // WARNING (n>=8)
  if(n>=8){
    if(sessionStats.limpOpp>=3&&limpPct>25) leaks.push({t:'warn',m:'リンプ率 '+limpPct+'% — オープンリンプが多めです（'+sessionStats.limp+'/'+sessionStats.limpOpp+'機会）。プリフロップはレイズファーストを意識してください。'});
    else if(pfrVpip<35&&vpipPct>12&&sessionStats.limpOpp<3) leaks.push({t:'warn',m:'PFR/VPIP比 '+pfrVpip+'% — レイズファーストを意識してください（目標: 65%以上）。'});
    if(cbetPct>=0&&cbetPct<35&&sessionStats.cbet.opp>=5) leaks.push({t:'warn',m:'CBet率 '+cbetPct+'% — Cベットが少なすぎます（目標: 55〜75%）。PFR後はフロップで積極的にベットしましょう。'});
    else if(cbetPct>88&&sessionStats.cbet.opp>=5) leaks.push({t:'warn',m:'CBet率 '+cbetPct+'% — Cベットしすぎです（目標: 55〜75%）。ミスマッチなボードではチェックを選びましょう。'});
    if(fToCbetPct>68&&sessionStats.fToCbet.opp>=5) leaks.push({t:'warn',m:'Fold to CBet '+fToCbetPct+'% — 相手のCBetに降りすぎです（目標: 40〜55%）。ドローや強手はコール・レイズを増やしましょう。'});
    if(avgScore<55&&sessionStats.scores.length>=5) leaks.push({t:'warn',m:'平均スコア '+avgScore+'点 — ミスが多めです。ハンドレビューでパターンを確認しましょう。'});
  }
  // IMPROVEMENT (n>=10)
  if(n>=10){
    if(wtsdPct>37&&sessionStats.wtsdSaw>=8) leaks.push({t:'improve',m:'WTSD '+wtsdPct+'% — ショーダウンまで行きすぎています（目標: 24〜30%）。弱い手はターン/リバーで降りましょう。'});
    else if(wtsdPct>=0&&wtsdPct<16&&sessionStats.wtsdSaw>=8) leaks.push({t:'improve',m:'WTSD '+wtsdPct+'% — ショーダウンが少なすぎます（目標: 24〜30%）。バリューハンドはコールを増やしましょう。'});
    if(wsdPct>=0&&wsdPct<45&&sessionStats.wsdWent>=5) leaks.push({t:'improve',m:'W$SD '+wsdPct+'% — ショーダウンで勝てていません（目標: 50%以上）。弱いハンドでのコールを減らしましょう。'});
    if(mistakeRate>30&&sessionStats.totalDec>=15) leaks.push({t:'improve',m:'ミス率 '+mistakeRate+'% — 判断ミスが多め（目標: 20%以下）。プリフロップとフロップの判断を重点的に見直して。'});
  }
  // PF vs PostF スコア分析
  if(n>=8&&poN<Math.max(3,Math.floor(n*0.15))){
    leaks.push({t:'warn',m:'PostFデータ '+poN+'手 / '+n+'手 — フロップ参加率が低すぎます。ポストフロップ力を鍛えるにはもっとフロップをプレーしましょう（目安VPIP 18〜35%）。フォールドばかりではポストフロップスコアが蓄積されません。'});
  }
  if(poN>=5&&avgPF-avgPO>20){
    leaks.push({t:'warn',m:'PFスコア '+avgPF+'pt vs PostFスコア '+avgPO+'pt — プリフロップは良いがポストフロップで大きく失点しています。フロップ以降のベットサイジング・ドロー評価・バリューベットを重点的に練習しましょう。'});
  } else if(poN>=5&&avgPO<60){
    leaks.push({t:'improve',m:'PostFスコア '+avgPO+'pt — ポストフロップの判断精度に課題があります（目標: 70pt以上）。テクスチャー分析とポジションを意識したベットサイズを練習しましょう。'});
  }
  // GOOD
  if(n>=8&&poN>=5&&avgPO>=80) leaks.push({t:'good',m:'PostFスコア '+avgPO+'pt — ポストフロップの判断が優秀です！この調子で続けましょう。'});
  else if(n>=8&&avgScore>=80&&sessionStats.scores.length>=5&&poN<5) leaks.push({t:'good',m:'平均スコア '+avgScore+'点 — 素晴らしい判断精度！フロップにも積極的に参加してポストフロップ評価を蓄積しましょう。'});
  if(n>=8&&leaks.length===0) leaks.push({t:'good',m:'目立ったリークなし — バランスの取れたプレーです。さらにハンドを積み重ねて深い分析を目指しましょう。'});

  var leakHtml='';
  leaks.forEach(function(lk){
    leakHtml+='<div style="margin-bottom:5px;padding:5px 8px;background:var(--panel2);border-radius:6px;border-left:2.5px solid '+tierCol[lk.t]+';font-size:10px;line-height:1.5">';
    leakHtml+='<span style="color:'+tierCol[lk.t]+';font-weight:800;font-size:9px;display:block;margin-bottom:1px">'+tierLbl[lk.t]+'</span>'+lk.m;
    leakHtml+='</div>';
  });

  // ---- ハンド数少 = 注意書きを上部 ----
  var finalHTML=sampleNote+scoreBand+sparkline+g1+g2+g3+leakHtml;
  targets.forEach(function(t){t.innerHTML=finalHTML;});
}

function renderRoster(){
  const rt=$('tab-roster');
  if(!rt)return;
  if(!game){rt.innerHTML='';return;}
  const ais=game.players.filter(p=>!p.isHuman&&p.active&&p.profile);
  rt.innerHTML='<div style="font-size:11px;color:var(--dim);margin-bottom:8px;">今回のテーブルのAI</div><div class="ai-roster">'
    +ais.map(p=>'<div class="ai-row"><div class="ai-dot" style="background:'+p.profile.color+'"></div>'
      +'<div><div class="ai-row-name" style="color:'+p.profile.color+'">'+p.profile.displayName+'</div>'
      +'<div class="ai-row-style">'+p.profile.style+'</div>'
      +'<div class="ai-row-desc">'+p.profile.desc+'</div></div></div>').join('')
    +'</div>';
}

function populateTips(){
  const el=$('tab-tips');
  if(!el)return;
  el.innerHTML=GTO_TIPS.map(t=>'<div class="gto-tip"><div class="tip-title">'+t.title+'</div>'+t.text+'</div>').join('');
}

// ---- GAME LOOP ----
let aiTimeout=null;
function runAI(){
  if(!game||game.waitingForHuman)return;
  if(game.street==='showdown'){if(!game._handEnded){finishHand();}return;}
  if(game.isHumanTurn()){
    // オールインランアウト: ヒーロー自身もオールイン済みのときだけ自動進行する。
    const _foes=game.nonFolded().filter(function(p){return !p.isHuman;});
    const _hum=game.players.find(function(p){return p.isHuman;});
    const _toCall=_hum?Math.max(0,game.currentBet-_hum.currentBet):1;
    if(_hum&&_hum.allIn&&_foes.length>0&&_foes.every(function(p){return p.allIn;})&&_toCall===0){
      const _hi=game.players.findIndex(function(p){return p.isHuman;});
      if(_hi>=0){
        game.processAction(_hi,'check',0);
        if(game.street==='showdown'){finishHand();}else{runAI();}
        return;
      }
    }
    game.waitingForHuman=true;renderTable();return;
  }
  const idx=game.actionIdx;
  if(idx<0){
    // [Claude fix 2026-06-07] アクター不在: _check()後も続行する。
    // 修正前: returnするだけでゲームがフリーズしていた。
    if(game.street!=='showdown'){game._check?game._check():null;}
    if(game.street==='showdown'){if(!game._handEnded){finishHand();}}
    else{runAI();}
    return;
  }
  const pl=game.players[idx];
  if(!pl||pl.folded||pl.allIn||!pl.active){
    // オールインプレイヤーがactionIdxに残っている edge case: 強制スキップ
    game.actorsRemaining=game.actorsRemaining.filter(function(i){return i!==idx;});
    game.actionIdx=game.actorsRemaining[0]??-1;
    if(game.actorsRemaining.length===0){if(game.street!=='showdown'){try{game._next();}catch(e){}};}
    if(game.street==='showdown'){if(!game._handEnded){finishHand();}return;}
    runAI();return;
  }
  aiTimeout=setTimeout(function(){
    const dec=aiDecide(pl,game,aiLevel);
    game.processAction(idx,dec.action,dec.amount||0);
    renderTable();
    if(game.street==='showdown')finishHand();
    else if(game.isHumanTurn()){game.waitingForHuman=true;renderTable();}
    else{game.waitingForHuman=false;runAI();}
  },AI_DELAY);
}
function fastFinishHand(){
  let iter=0;
  while(game.street!=='showdown'&&iter++<300){
    if(game.isHumanTurn())game.waitingForHuman=false;
    const idx=game.actionIdx;
    if(idx<0){
      // アクション終了 → 次ストリートへ
      try{game._next();}catch(e){console.warn('fastFinish _next:',e);break;}
      continue;
    }
    const pl=game.players[idx];
    if(!pl||pl.folded||pl.allIn||!pl.active){
      // オールイン・フォールド済みプレイヤーをスキップ
      game.actorsRemaining=(game.actorsRemaining||[]).filter(function(i){return i!==idx;});
      game.actionIdx=game.actorsRemaining.length>0?game.actorsRemaining[0]:-1;
      if(game.actorsRemaining.length===0){
        try{game._next();}catch(e){console.warn('fastFinish _next2:',e);break;}
      }
      continue;
    }
    const dec=aiDecide(pl,game,aiLevel);
    game.processAction(idx,dec.action,dec.amount||0);
  }
  if(!game._handEnded)finishHand();
}
function humanAction(action,amt){
  if(!game.isHumanTurn())return;
  game.waitingForHuman=false;
  game.processAction(game.players.findIndex(p=>p.isHuman),action,amt);
  renderTable();
  if(game.street==='showdown'){finishHand();}
  else if(action==='fold'){
    if(aiTimeout)clearTimeout(aiTimeout);
    setTimeout(function(){fastFinishHand();},150);
  }else{runAI();}
}
function finishHand(){
  if(!game||game._handEnded)return;
  game._handEnded=true;
  const last=game.handHistory[0];
  // [Claude fix 2026-06-07] handNum不一致はshowdown未到達(前ハンドの履歴を拾った)と判断
  if(!last||last.handNum!==game.handNum){
    console.error('finishHand: handHistory mismatch — showdown未到達の可能性あり',
      last?'expected handNum='+game.handNum+' got='+last.handNum:'empty');
    setTimeout(startNewHand,800);
    return;
  }
  game._lastWinners=last.winners.map(w=>game.players.indexOf(w.player));
  for(const w of last.winners){
    if(w.player.isHuman)toast('あなたが +'+w.amount+' チップ獲得！','win',3500);
    else toast(w.player.name+' が +'+w.amount+' チップ獲得','info',2500);
  }
  renderTable();updateHistory();
  // [Claude fix 2026-06-07] updateSessionStats も try-catch で包み、
  // どこで例外が起きても必ず startNewHand() が呼ばれるようにする。
  setTimeout(function(){
    var an=null;
    try{an=showAnalysis(last);}catch(e){
      console.error('showAnalysis error:',e,e&&e.stack);
    }
    try{updateSessionStats(last,an);}catch(e){
      console.error('updateSessionStats error:',e);
    }
    if(!an){
      // showAnalysisが失敗した場合のみ自動で次のハンドへ
      try{startNewHand();}catch(e){console.error('startNewHand error:',e);}
    }
  },1100);
}
// ============================================================
// [Claude feature 2026-05-23] フロップトレーニングモード
// プリフロップをサイレントに完了し、フロップからトレーニング開始。
// Codex連携: game._scenario にシナリオ情報, game._pfStory にプリフロップストーリーを保存。
// シナリオカテゴリはユーザーには非表示。ターン/リバー予約カード(F/G)はgame._scenario内。
// ============================================================
var _scenarioMode=false;
const SCENARIO_LABELS={
  paired:'ペアボード',aceHighDry:'エースハイドライ',broadway:'ブロードウェイ',
  midConnected:'ミッドコネクテッド',flushDraw:'フラッシュドロー系',
  monotone:'モノトーン',wetCombo:'連結+フラッシュ',
  turnScary:'ターン危険カード',riverComplete:'リバー完成カード'
};
function _pickScenarioCat(){
  const cats=['paired','aceHighDry','broadway','midConnected','flushDraw','monotone','wetCombo','turnScary','riverComplete'];
  const wts  =[   12,      12,         10,          14,           15,         8,         12,         9,            8   ];
  let r=Math.random()*wts.reduce((a,b)=>a+b,0);
  for(let i=0;i<cats.length;i++){r-=wts[i];if(r<=0)return cats[i];}
  return cats[0];
}
function _genScenarioFlop(deckCards,category){
  const S=['h','d','c','s'],R=['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const rnd=a=>a[Math.floor(Math.random()*a.length)];
  const takeCard=(rank,suit)=>{const i=deckCards.findIndex(c=>c.rank===rank&&c.suit===suit);return i>=0?deckCards.splice(i,1)[0]:null;};
  let baseCategory=category;
  if(category==='turnScary'||category==='riverComplete')baseCategory=rnd(['flushDraw','midConnected','aceHighDry','flushDraw','wetCombo']);
  for(let attempt=0;attempt<300;attempt++){
    let specs=null;
    if(baseCategory==='paired'){
      const pr=rnd(R),or=rnd(R.filter(r=>r!==pr)),ps=S.slice().sort(()=>Math.random()-0.5).slice(0,2);
      specs=[{rank:pr,suit:ps[0]},{rank:pr,suit:ps[1]},{rank:or,suit:rnd(S)}];
    }else if(baseCategory==='aceHighDry'){
      const l1=rnd(['2','3','4','5','6','7','8','9']),l2=rnd(['2','3','4','5','6','7','8','9'].filter(r=>r!==l1));
      const[s1,s2,s3]=S.slice().sort(()=>Math.random()-0.5).slice(0,3);
      specs=[{rank:'A',suit:s1},{rank:l1,suit:s2},{rank:l2,suit:s3}];
    }else if(baseCategory==='broadway'){
      const tops=['A','K','Q','J','T'],si=Math.floor(Math.random()*3);
      const[s1,s2,s3]=S.slice().sort(()=>Math.random()-0.5).slice(0,3);
      specs=[{rank:tops[si],suit:s1},{rank:tops[si+1],suit:s2},{rank:tops[si+2],suit:s3}];
    }else if(baseCategory==='midConnected'){
      const mid=['5','6','7','8','9','T','J'],si=Math.floor(Math.random()*(mid.length-2));
      const[s1,s2,s3]=S.slice().sort(()=>Math.random()-0.5).slice(0,3);
      specs=[{rank:mid[si],suit:s1},{rank:mid[si+1],suit:s2},{rank:mid[si+2],suit:s3}];
    }else if(baseCategory==='flushDraw'){
      const fs=rnd(S),os=rnd(S.filter(s=>s!==fs));
      const r1=rnd(R),r2=rnd(R.filter(r=>r!==r1)),r3=rnd(R.filter(r=>r!==r1&&r!==r2));
      specs=[{rank:r1,suit:fs},{rank:r2,suit:fs},{rank:r3,suit:os}];
    }else if(baseCategory==='monotone'){
      const ms=rnd(S),r1=rnd(R),r2=rnd(R.filter(r=>r!==r1)),r3=rnd(R.filter(r=>r!==r1&&r!==r2));
      specs=[{rank:r1,suit:ms},{rank:r2,suit:ms},{rank:r3,suit:ms}];
    }else{// wetCombo
      const mid=['5','6','7','8','9','T','J','Q'],si=Math.floor(Math.random()*(mid.length-2));
      const ws=rnd(S),os=rnd(S.filter(s=>s!==ws)),which=Math.floor(Math.random()*3);
      const ss=[os,os,os];ss[which]=ws;ss[(which+1)%3]=ws;
      specs=[{rank:mid[si],suit:ss[0]},{rank:mid[si+1],suit:ss[1]},{rank:mid[si+2],suit:ss[2]}];
    }
    if(!specs)continue;
    if(!specs.every(sp=>deckCards.some(c=>c.rank===sp.rank&&c.suit===sp.suit)))continue;
    const flopCards=specs.map(sp=>takeCard(sp.rank,sp.suit)).filter(Boolean);
    if(flopCards.length!==3)continue;
    let turnCard=null,riverCard=null;
    if(category==='turnScary'){
      const fc={};flopCards.forEach(c=>fc[c.suit]=(fc[c.suit]||0)+1);
      const ds=Object.keys(fc).find(s=>fc[s]>=2);
      const br=flopCards.map(c=>c.rank);
      let cands=ds?deckCards.filter(c=>c.suit===ds):[];
      if(!cands.length)cands=deckCards.filter(c=>c.rank==='A'&&!br.includes('A'));
      if(!cands.length)cands=deckCards.filter(c=>['A','K','Q'].includes(c.rank)&&!br.includes(c.rank));
      // [Codex fix 2026-05-26] 予約ターンカードは以後のホールカード配布から除外する。
      if(cands.length){turnCard=cands[Math.floor(Math.random()*cands.length)];takeCard(turnCard.rank,turnCard.suit);}
    }else if(category==='riverComplete'){
      const fc={};flopCards.forEach(c=>fc[c.suit]=(fc[c.suit]||0)+1);
      const ds=Object.keys(fc).find(s=>fc[s]>=2);
      const cands=ds?deckCards.filter(c=>c.suit===ds):deckCards.filter(c=>['A','K'].includes(c.rank));
      // [Codex fix 2026-05-26] 予約リバーカードもデッキから抜き、重複カードを防ぐ。
      if(cands.length){riverCard=cands[Math.floor(Math.random()*cands.length)];takeCard(riverCard.rank,riverCard.suit);}
    }
    return{flopCards,turnCard,riverCard,category,label:SCENARIO_LABELS[category]||category};
  }
  return{flopCards:[deckCards.splice(0,1)[0],deckCards.splice(0,1)[0],deckCards.splice(0,1)[0]],turnCard:null,riverCard:null,category:'random',label:'ランダム'};
}
// [Codex fix 2026-05-26] フロップトレーニングの生成ハンドを、プリフロップストーリーと矛盾しにくいレンジに寄せる。
function _scenarioHandAllowed(c1,c2,maxFrac,ctx){
  const ht=handType(c1,c2);
  const frac=HAND_COMBO_FRAC[ht]||0.99;
  if(frac>maxFrac)return false;
  ctx=ctx||{};
  const r1=RANK_VAL[c1.rank]||0,r2=RANK_VAL[c2.rank]||0;
  const hi=Math.max(r1,r2),lo=Math.min(r1,r2);
  const suited=c1.suit===c2.suit,pair=r1===r2;
  if(ctx.role==='caller'){
    if(pair)return frac<=Math.min(maxFrac,0.24);
    if(suited)return true;
    if(hi===14&&lo>=12)return true; // AQo+は一部コール/3bet混合として許容
    if(ctx.pos==='BTN'&&hi>=13&&lo>=12)return true; // KQoはBTNでのみ少量
    return false;
  }
  if(ctx.role==='threeBetCaller'){
    if(pair)return frac<=Math.min(maxFrac,0.18);
    if(suited&&hi>=12)return true;
    return hi===14&&lo>=12;
  }
  if(ctx.role==='openerPure'){
    const pos=ctx.pos||'CO';
    const totalP=ctx.totalP||6;
    const chart=preflopChartLookup('open',ht,pos,totalP,{});
    return chart.status==='pure';
  }
  return true;
}
function _dealRangeHand(deckCards,maxFrac,ctx){
  for(let i=0;i<300;i++){
    if(deckCards.length<2)break;
    const i1=Math.floor(Math.random()*deckCards.length),i2=Math.floor(Math.random()*deckCards.length);
    if(i1===i2)continue;
    const c1=deckCards[i1],c2=deckCards[i2];
    if(_scenarioHandAllowed(c1,c2,maxFrac,ctx)){
      const hi=Math.max(i1,i2),lo=Math.min(i1,i2);
      return[deckCards.splice(hi,1)[0],deckCards.splice(lo,1)[0]];
    }
  }
  for(let i=0;i<deckCards.length;i++){
    for(let j=i+1;j<deckCards.length;j++){
      if(_scenarioHandAllowed(deckCards[i],deckCards[j],maxFrac,ctx)){
        return[deckCards.splice(j,1)[0],deckCards.splice(i,1)[0]];
      }
    }
  }
  if(ctx&&ctx.strict)return[];
  if(deckCards.length>=2)return[deckCards.splice(0,1)[0],deckCards.splice(0,1)[0]];
  return[];
}
function _buildAndApplyPreflopStory(game){
  const bb=game.bb,sb=game.sb;
  const nActive=game.players.filter(p=>p.active).length;
  const humanIdx=game.players.findIndex(p=>p.isHuman);
  const humanPos=posLabel(humanIdx,game.dealerIndex,nActive);
  const activePIs=game.players.map((p,i)=>i).filter(i=>game.players[i].active);
  const othersPI=activePIs.filter(i=>i!==humanIdx);
  const pickOther=(excl=[])=>{const pool=othersPI.filter(i=>!excl.includes(i));return pool.length?pool[Math.floor(Math.random()*pool.length)]:null;};
  // [Claude fix 2026-05-24] プリフロップ行動順: 先に行動するポジション(小PRI)がオープナー
  // UTG=0…BTN=6→SB=7→BB=8。openerのPRI < callerのPRI が必須
  const PF_PRI_MAP={'UTG':0,'UTG+1':1,'MP':2,'LJ':3,'HJ':4,'CO':5,'BTN':6,'SB':7,'BB':8};
  const pfPri=(idx)=>PF_PRI_MAP[posLabel(idx,game.dealerIndex,nActive)]??5;
  const roll=Math.random();
  let type;
  if(nActive<=2)type='raise_HU';
  else if(roll<0.38)type='raise_HU';
  else if(roll<0.60)type='raise_multi';
  else if(roll<0.75)type='threeBet';
  else if(roll<0.87)type='limp';
  else type='blindBattle';
  // [Codex fix 2026-05-26] ユーザーがSB/BBでない時にブラインド限定シナリオを作ると、ユーザー不参加のハンドになる。
  if((type==='limp'||type==='blindBattle')&&![game.sbIdx,game.bbIdx].includes(humanIdx))type='raise_HU';
  let participants=[humanIdx],narrative='',pot=0,humanRole='caller';
  let maxFracH=0.30,maxFracO=0.28;
  const openAmt=Math.round(bb*(2.5+Math.random()*1.5));
  const threeBetAmt=Math.round(openAmt*(3.0+Math.random()*0.8));
  if(type==='raise_HU'){
    const opp=pickOther();
    if(opp===null){type='blindBattle';}else{
      participants=[humanIdx,opp];
      const oppPos=posLabel(opp,game.dealerIndex,nActive),oppName=game.players[opp].name;
      pot=openAmt*2;
      // 行動順で役割を決定: 先に行動する側がオープナー
      const humanFirst=pfPri(humanIdx)<pfPri(opp);
      if(humanFirst){
        humanRole='raiser';maxFracH=POS_RANGE.medium[humanPos]||0.25;maxFracO=Math.min(0.45,(POS_RANGE.medium[oppPos]||0.25)*1.6);
        narrative=humanPos+'(あなた) '+openAmt+'T オープン → '+oppPos+'('+oppName+') '+openAmt+'T コール';
      }else{
        humanRole='caller';maxFracH=Math.min(0.45,(POS_RANGE.medium[humanPos]||0.25)*1.6);maxFracO=POS_RANGE.medium[oppPos]||0.25;
        narrative=oppPos+'('+oppName+') '+openAmt+'T オープン → '+humanPos+'(あなた) '+openAmt+'T コール';
      }
    }
  }
  if(type==='raise_multi'){
    const opp1=pickOther(),opp2=othersPI.length>1?pickOther([opp1]):null;
    participants=[humanIdx,opp1,...(opp2?[opp2]:[])].filter(i=>i!==null);
    pot=openAmt*participants.length;
    // 参加者の中で最もPRI小（最初に行動）がオープナー
    const openerIdx=participants.reduce((best,i)=>pfPri(i)<pfPri(best)?i:best,participants[0]);
    const op1Pos=posLabel(opp1,game.dealerIndex,nActive),op1Name=game.players[opp1].name;
    if(openerIdx===humanIdx){
      humanRole='raiser';maxFracH=POS_RANGE.medium[humanPos]||0.25;maxFracO=0.40;
      let s=humanPos+'(あなた) '+openAmt+'T オープン → '+op1Pos+'('+op1Name+') '+openAmt+'T コール';
      if(opp2)s+=' → '+posLabel(opp2,game.dealerIndex,nActive)+'('+game.players[opp2].name+') '+openAmt+'T コール';
      narrative=s;
    }else{
      humanRole='caller';maxFracH=0.40;maxFracO=POS_RANGE.medium[op1Pos]||0.25;
      const openerPos=posLabel(openerIdx,game.dealerIndex,nActive),openerName=game.players[openerIdx].name;
      let s=openerPos+'('+openerName+') '+openAmt+'T オープン → '+humanPos+'(あなた) '+openAmt+'T コール';
      const callers=participants.filter(i=>i!==openerIdx&&i!==humanIdx);
      callers.forEach(i=>{ s+=' → '+posLabel(i,game.dealerIndex,nActive)+'('+game.players[i].name+') '+openAmt+'T コール'; });
      narrative=s;
    }
  }
  if(type==='threeBet'){
    const opp=pickOther();
    if(opp===null){type='blindBattle';}else{
      participants=[humanIdx,opp];
      const oppPos=posLabel(opp,game.dealerIndex,nActive),oppName=game.players[opp].name;
      pot=openAmt+threeBetAmt+openAmt;
      // 先に行動する側がオープン → 後に行動する側が3BET
      const humanFirst=pfPri(humanIdx)<pfPri(opp);
      if(humanFirst){
        // human先行動→openして、oppが3BET→humanコール
        // [Codex fix 2026-05-26] 3betにコールする側は通常のcold callより強いレンジで生成する。
        humanRole='threeBetCaller';maxFracH=0.14;maxFracO=0.10;
        narrative=humanPos+'(あなた) '+openAmt+'T オープン → '+oppPos+'('+oppName+') '+threeBetAmt+'T 3BET → '+humanPos+' コール';
      }else{
        // opp先行動→openして、humanが3BET→oppコール
        humanRole='threeBetter';maxFracH=0.10;maxFracO=0.14;
        narrative=oppPos+'('+oppName+') '+openAmt+'T オープン → '+humanPos+'(あなた) '+threeBetAmt+'T 3BET → '+oppPos+' '+openAmt+'T コール';
      }
    }
  }
  if(type==='limp'){
    const sbI=game.sbIdx,bbI=game.bbIdx;
    participants=[sbI,bbI];
    if(!participants.includes(humanIdx))participants[0]=humanIdx;
    pot=sb+bb;humanRole='limp';maxFracH=0.55;maxFracO=0.60;
    const sbName=game.players[sbI].name,bbName=game.players[bbI].name;
    const sbPart=humanIdx===sbI?'SB(あなた)':'SB('+sbName+')';
    const bbPart=humanIdx===bbI?'BB(あなた)':'BB('+bbName+')';
    narrative=sbPart+' '+bb+'T リンプ → '+bbPart+' チェック';
  }
  if(type==='blindBattle'){
    const sbI=game.sbIdx,bbI=game.bbIdx;
    participants=[sbI,bbI];
    pot=sb+bb;humanRole='bb';maxFracH=0.65;maxFracO=0.60;
    const sbP=posLabel(sbI,game.dealerIndex,nActive),bbP=posLabel(bbI,game.dealerIndex,nActive);
    const sbName=humanIdx===sbI?'あなた':game.players[sbI].name;
    const bbName=humanIdx===bbI?'あなた':game.players[bbI].name;
    narrative=sbP+'('+sbName+') SBコール → '+bbP+'('+bbName+') チェック';
  }
  // 非参加者をフォールド
  game.players.forEach((p,i)=>{
    if(!p.active)return;
    if(!participants.includes(i)){p.folded=true;p.holeCards=[];}
  });
  // ポット・チップ設定
  // [Claude fix 2026-05-23] SB/BBのデッドマネーをポットに加算。非参加SB/BBもチップを減らす
  const _sbIdx=game.sbIdx,_bbIdx=game.bbIdx;
  const _deadSB=(!participants.includes(_sbIdx))?sb:0;
  const _deadBB=(!participants.includes(_bbIdx))?bb:0;
  const _deadMoney=_deadSB+_deadBB;
  const invEach=Math.round(pot/Math.max(1,participants.length)); // 参加者の個別投資額
  pot+=_deadMoney; // デッドマネー込みの総ポット（fullNarrativeにも反映）
  game.pot=pot;game.currentBet=0;
  game.players.forEach((p,i)=>{
    p.currentBet=0;
    if(participants.includes(i)){p.totalInvested=invEach;p.chips=Math.max(1,p.chips-invEach);}
    else if(i===_sbIdx&&_deadSB>0){p.totalInvested=_deadSB;p.chips=Math.max(1,p.chips-_deadSB);}
    else if(i===_bbIdx&&_deadBB>0){p.totalInvested=_deadBB;p.chips=Math.max(1,p.chips-_deadBB);}
    else{p.totalInvested=0;}
  });
  // ハンド配布
  participants.forEach(pi=>{
    const p=game.players[pi];
    const fr=p.isHuman?maxFracH:maxFracO;
    // [Codex fix 2026-05-26] ユーザーの生成ハンドは「そのプリフロップで参加して自然な種類」に制限する。
    const roleCtx=p.isHuman
      ? {role:humanRole==='caller'?'caller':humanRole==='threeBetCaller'?'threeBetCaller':humanRole==='threeBetter'?'threeBetter':humanRole==='bb'||humanRole==='limp'?'blind':'opener',pos:posLabel(pi,game.dealerIndex,nActive)}
      : {role:'opponent',pos:posLabel(pi,game.dealerIndex,nActive)};
    const hand=_dealRangeHand(game.deck.cards,fr,roleCtx);
    if(hand.length>=2)p.holeCards=hand;
  });
  const fullNarrative=narrative+' | ポット '+pot+'T';
  game._pfStory={type,humanRole,participants,pot,narrative:fullNarrative};
}
function renderScenarioBanner(){
  const el=document.getElementById('scenario-banner');
  if(!el)return;
  if(!game||!game._pfStory){el.style.display='none';return;}
  el.style.display='block'; // [Claude fix 2026-05-23] ''だとCSSのdisplay:noneにフォールバックするため'block'を明示
  el.textContent=game._pfStory.narrative;
}
function _resetScenarioAttemptState(game,baseChips){
  game.deck.reset();game.deck.shuffle();
  game.players.forEach(function(p,i){
    p.holeCards=[];
    p.folded=false;
    p.allIn=false;
    p.currentBet=0;
    p.totalInvested=0;
    p.chips=baseChips[i];
  });
  game.community=[];
  game.pot=0;
  game.currentBet=0;
  game.minRaise=game.bb;
  game.actorsRemaining=[];
  game.actionIdx=-1;
  game.currentHandDecisions=[];
  game._scenario=null;
  game._pfStory=null;
  game._scenarioQuality=null;
}
function startScenarioHand(){
  if(aiTimeout)clearTimeout(aiTimeout);
  game.waitingForHuman=false;game._lastWinners=[];game._handEnded=false;
  game._scenario=null;game._pfStory=null;
  game.players.forEach(p=>p._rebought=false);
  // 1. startHand()でデッキ・ポジション初期化
  game.startHand();
  // 2. ブラインド投入を取り消し、ホールカードをデッキへ戻す
  game.players.forEach(p=>{
    p.holeCards.forEach(c=>game.deck.cards.push(c));
    p.holeCards=[];
    p.chips+=p.totalInvested;
    p.totalInvested=0;p.currentBet=0;
  });
  game.pot=0;game.deck.shuffle();
  const baseChips=game.players.map(function(p){return p.chips;});
  let scenario=null,quality=null;
  for(let attempt=0;attempt<8;attempt++){
    _resetScenarioAttemptState(game,baseChips);
    // 3. シナリオフロップ生成（予約カードをデッキから除外）
    const cat=_pickScenarioCat();
    scenario=_genScenarioFlop(game.deck.cards,cat);
    game._scenario=scenario;
    // 4. プリフロップストーリー構築 + ハンド配布 + ポット設定
    _buildAndApplyPreflopStory(game);
    // 5. フロップへジャンプ
    game.street='flop';game.community=scenario.flopCards;
    game.currentBet=0;game.players.forEach(p=>p.currentBet=0);
    game._setOrder();
    quality=trainingSpotQualityAudit(game,{mode:'scenario'});
    if(quality.ok)break;
  }
  game._scenarioQuality=quality;
  if(quality&&!quality.ok&&typeof console!=='undefined'){
    console.warn('Scenario quality fallback:',trainingSpotQualityText(quality));
  }
  // 6. リバイ通知
  game.players.forEach(function(p){
    if(p._rebought){
      if(p.isHuman)toast('バスト！'+game.startingChips+' チップでリバイしました。','warn',4000);
      else toast(p.name+' がリバイ（'+game.startingChips+'チップ）','info',2500);
    }
  });
  renderScenarioBanner();renderTable();runAI();
}
function startNewHand(){
  if(aiTimeout)clearTimeout(aiTimeout);
  game.waitingForHuman=false;game._lastWinners=[];game._handEnded=false;
  game.players.forEach(p=>p._rebought=false);
  // [Claude feature 2026-05-23] シナリオモード分岐
  if(_scenarioMode){startScenarioHand();return;}
  game.startHand();
  // リバイ通知
  game.players.forEach(function(p){
    if(p._rebought){
      if(p.isHuman)toast('バスト！'+game.startingChips+' チップでリバイしました。','warn',4000);
      else toast(p.name+' がリバイ（'+game.startingChips+'チップ）','info',2500);
    }
  });
  renderTable();runAI();
}

// ---- EVENTS ----
// [Claude feature 2026-05-23] 共通: GameEngine生成 + 画面遷移
function _initGame(mode){
  let n=+$('cfg-players').value;
  let sb=+$('cfg-sb').value,bb=+$('cfg-bb').value;
  aiLevel=$('cfg-ai').value;
  let tctx=mode==='tournament'?cloneTournamentPreset($('cfg-tournament-preset').value):null;
  if(tctx)tctx=applyTournamentFocus(tctx,$('cfg-tournament-focus').value);
  // [Codex fix 2026-05-28] Tモードはプリセットを正にして、20BBなどを20チップとして開始しない。
  const stackBB=tctx&&tctx.enabled?+(tctx.stackBB||25):+$('cfg-stack').value;
  if(tctx&&tctx.enabled){n=+(tctx.players||n);sb=+(tctx.sb||sb);bb=+(tctx.bb||bb);}
  if(bb>=20&&aiLevel!=='hard'){aiLevel='hard';$('cfg-ai').value='hard';}
  game=new GameEngine({numPlayers:n,sb:sb,bb:bb,startingChips:bb*stackBB,aiLevel:aiLevel,tournamentContext:tctx});
  _scenarioMode=(mode==='scenario');
  showScreen('game-screen');
  // HUDにモード表示
  const hudTitle=document.querySelector('#hud .hud-title');
  if(hudTitle)hudTitle.textContent=_scenarioMode?'🎯 Fish Tank — フロップトレーナー':(mode==='tournament'?'🏆 Fish Tank — Tournament':'🐟 Fish Tank Poker');
  refreshHudPracticeFocus();
  startNewHand();
}
// [Claude fix 2026-05-23] ゲームモードプルダウンから起動モードを取得
$('btn-start').addEventListener('click',function(){_initGame($('cfg-mode').value);});

function applyTournamentPresetToSetup(){
  const isT=$('cfg-mode').value==='tournament';
  const wrap=$('cfg-tournament-wrap');
  if(wrap)wrap.classList.toggle('hidden',!isT);
  if(!isT)return;
  const focusEl=$('cfg-tournament-focus');
  const focus=focusEl?(TOURNAMENT_FOCUS_PRESETS[focusEl.value]||TOURNAMENT_FOCUS_PRESETS.general):TOURNAMENT_FOCUS_PRESETS.general;
  if(focus.preset&&$('cfg-tournament-preset').value!==focus.preset)$('cfg-tournament-preset').value=focus.preset;
  const p=cloneTournamentPreset($('cfg-tournament-preset').value);
  $('cfg-players').value=String(p.players);
  $('cfg-sb').value=String(p.sb);
  $('cfg-bb').value=String(p.bb);
  $('cfg-stack').value=String(p.stackBB);
  const note=$('cfg-tournament-note');
  const ctx=applyTournamentFocus(p,focus.id);
  if(note)note.textContent=tournamentContextText(ctx)+'。'+p.note+(focus.goal?' 練習テーマ: '+focus.goal:'');
}
$('cfg-mode').addEventListener('change',applyTournamentPresetToSetup);
// [feature 2026-06-10] レンジ判定モード(GTO/Live)の初期化と切替。localStorageに永続化。
(function(){var el=$('cfg-range-mode');if(!el)return;try{var sv=localStorage.getItem('fish_tank_range_mode');if(sv==='gto'||sv==='live'){setRangeMode(sv);el.value=getRangeMode();}else{setRangeMode(el.value);}}catch(e){setRangeMode(el.value);}el.addEventListener('change',function(){setRangeMode(el.value);try{localStorage.setItem('fish_tank_range_mode',getRangeMode());}catch(e){}});})();
initSessionChecklistUI();
$('cfg-tournament-preset').addEventListener('change',applyTournamentPresetToSetup);
$('cfg-tournament-focus').addEventListener('change',applyTournamentPresetToSetup);
applyTournamentPresetToSetup();

// SBが変わったらBBを自動で2倍に設定（目安）
$('cfg-sb').addEventListener('change',function(){
  const sbVal=+this.value;
  const bbSel=$('cfg-bb');
  const autoMap={1:2,2:5,5:10,10:20};
  if(autoMap[sbVal]){
    bbSel.value=String(autoMap[sbVal]);
  }
});
$('btn-fold').addEventListener('click',function(){humanAction('fold',0);});
$('btn-check').addEventListener('click',function(){humanAction('check',0);});
$('btn-call').addEventListener('click',function(){humanAction('call',0);});
$('btn-raise').addEventListener('click',function(){
  const h=game&&game.players.find(function(p){return p.isHuman;});
  const amt=+$('raise-slider').value;
  if(h&&amt>=h.chips+h.currentBet)humanAction('allin',0);
  else humanAction('raise',amt);
});
$('btn-allin').addEventListener('click',function(){humanAction('allin',0);});
$('raise-slider').addEventListener('input',function(){
  $('raise-amount').value=$('raise-slider').value;
  document.querySelectorAll('.qbtn').forEach(function(b){b.classList.remove('active-q');});
});
// ---- ボトムシート: 開く/閉じる ----
function isLandscape(){return window.matchMedia('(min-width:860px) and (orientation:landscape)').matches;}
function openSheet(tab){
  // シートのタブを切り替え
  document.querySelectorAll('.stab').forEach(function(s){s.classList.toggle('active',s.dataset.stab===tab);});
  ['history','trends','glossary','live'].forEach(function(id){
    var el=$('stab-'+id);if(el)el.classList.toggle('hidden',id!==tab);
  });
  // コンテンツをリフレッシュ
  if(tab==='trends')renderTrends();
  if(tab==='history'){var html=_historyHTML();var sh=$('stab-history');if(sh)sh.innerHTML=html;}
  if(tab==='glossary'){var sg=$('stab-glossary');if(sg)sg.innerHTML=renderGlossary();}
  if(tab==='live'){var sl=$('stab-live');if(sl)sl.innerHTML=renderLivePractice();}
  $('sheet-overlay').classList.add('open');
}
function closeSheet(){$('sheet-overlay').classList.remove('open');}
$('sheet-close-btn').addEventListener('click',closeSheet);
$('sheet-overlay').addEventListener('click',function(e){if(e.target===$('sheet-overlay'))closeSheet();});
document.querySelectorAll('.stab').forEach(function(btn){
  btn.addEventListener('click',function(){openSheet(btn.dataset.stab);});
});

// ---- サイドパネル tab切替（横画面デスクトップ用） ----
document.querySelectorAll('[data-tab]').forEach(function(btn){
  btn.addEventListener('click',function(){
    const t=btn.dataset.tab;
    if(!isLandscape()){
      // 縦画面/モバイル → シートを開く
      openSheet(t);
      return;
    }
    // 横画面デスクトップ → サイドパネルで切り替え
    document.querySelectorAll('.side-tab').forEach(function(s){s.classList.remove('active');});
    document.querySelectorAll('.side-tab[data-tab="'+t+'"]').forEach(function(s){s.classList.add('active');});
    ['history','trends','glossary','live'].forEach(function(id){var el=$('tab-'+id);if(el)el.classList.toggle('hidden',id!==t);});
    if(t==='glossary'){var tg=$('tab-glossary');if(tg)tg.innerHTML=renderGlossary();}
    if(t==='live'){var tl=$('tab-live');if(tl)tl.innerHTML=renderLivePractice();}
    if(t==='trends')renderTrends();
  });
});

// ---- 分析モーダル: 閉じるボタン ----
$('close-only').addEventListener('click',function(){
  $('analysis-modal').classList.remove('open');
  // 新ハンドを開始しない（履歴閲覧 or 単に閉じるだけ）
});
$('close-analysis').addEventListener('click',function(){
  $('analysis-modal').classList.remove('open');
  if(!_analysisFromHistory&&game&&!game.gameOver)setTimeout(startNewHand,300);
});
const regressionBtn=$('btn-regression');
if(regressionBtn){
  regressionBtn.addEventListener('click',function(){
    const summary=runFishTankRegressionTests();
    const msg=fishTankRegressionReportText(summary);
    console.log(msg);
    if(typeof toast==='function')toast(summary.ok?'回帰検査 OK: '+summary.passed+'/'+summary.total:'回帰検査 NG: '+summary.passed+'/'+summary.total,summary.ok?'win':'info',5000);
    alert(msg);
  });
}
const auditBatchBtn=$('btn-audit-batch');
if(auditBatchBtn){
  auditBatchBtn.addEventListener('click',function(){
    const summary=runFishTankAuditBatch({perMode:3,seed:20260605,maxExamples:18,maxActions:90});
    const msg=fishTankAuditBatchReportText(summary);
    const plan=fishTankAuditRepairPlanText(summary);
    window.__fishTankLastAuditBatch=summary;
    try{localStorage.setItem('fish_tank_last_audit_batch',JSON.stringify(summary));}catch(e){}
    console.log(msg,summary);
    console.log(plan);
    if(typeof toast==='function')toast(summary.ok?'監査バッチ OK: 重大FAILなし':'監査バッチ 要確認: Critical '+summary.criticalCount,summary.ok?'win':'info',6000);
    alert(msg);
  });
}
const reanalyzeBtn=$('btn-reanalyze');
if(reanalyzeBtn){
  reanalyzeBtn.addEventListener('click',function(){
    rerunHandAnalysis(null,true);
  });
}
$('btn-quit').addEventListener('click',function(){
  if(sessionChecklistEnabled()){
    if(!openSessionEndChecklist()&&confirm('ゲームを終了してメインメニューに戻りますか？'))finishSessionToSetup();
    return;
  }
  if(confirm('ゲームを終了してメインメニューに戻りますか？'))finishSessionToSetup();
});
$('session-end-cancel').addEventListener('click',function(){
  const modal=$('session-end-modal');if(modal)modal.classList.remove('open');
});
$('session-end-confirm').addEventListener('click',function(){
  const modal=$('session-end-modal');if(modal)modal.classList.remove('open');
  finishSessionToSetup();
});
// [Codex fix 2026-05-26] 重複していた履歴クリック登録は削除済み。直下は統計リセット用。
document.addEventListener('click',function(e){
  const practiceBtn=e.target&&e.target.closest&&e.target.closest('.session-apply-practice');
  if(practiceBtn){
    applySessionPracticeRecommendation({
      modeValue:practiceBtn.dataset.mode||'normal',
      focusValue:practiceBtn.dataset.focus||'',
      presetValue:practiceBtn.dataset.preset||'',
      mode:practiceBtn.dataset.modeLabel||'',
      focus:practiceBtn.dataset.focusLabel||'',
      status:practiceBtn.dataset.status||'',
      reason:practiceBtn.dataset.reason||''
    });
    return;
  }
  if(e.target&&(e.target.id==='btn-reset-stats'||e.target.id==='btn-reset-stats2')){
    if(confirm('統計データをリセットしますか？（累積ハンド数・VPIP・CBet等がすべてクリアされます）')){
      try{localStorage.removeItem(_STATS_KEY);}catch(ex){}
      Object.keys(_statsDef).forEach(function(k){sessionStats[k]=_statsDef[k];});
      sessionStats.scores=[];sessionStats.pfScores=[];sessionStats.poScores=[];
      sessionStats.byPos={};sessionStats.cbet={opp:0,bet:0};sessionStats.fToCbet={opp:0,fold:0};
      renderTrends();
    }
  }
});

window.__fishTankDebug={GameEngine,AI_PROFILES,aiDecide,analyzeHand,runFishTankRegressionTests,fishTankRegressionReportText,runFishTankAuditBatch,fishTankAuditBatchReportText,buildFishTankAuditRepairQueue,fishTankAuditRepairPlanText,auditIssuesForHand,playAuditGame,rerunHandAnalysis,evaluationSnapshot,getDebugHand,preflopPremiseAudit,trainingSpotQualityAudit,trainingSpotQualityText,actualHandLeakAudit,actualHandLeakAuditText,actualHandVisibility,boardTextureProfile,boardTextureProfileText,representativeBoardProfile,boardTextureFrequencyAdjustment,boardTextureSizePlan,boardTextureTransitionProfile,boardTextureTransitionProfileText,rangeNutAdvantageProfile,rangeNutAdvantageProfileText,rangeActionUpdateProfile,rangeActionUpdateProfileText,postflopBetPurposeProfile,postflopBetPurposeProfileText,postflopRaisePlanProfile,postflopRaisePlanProfileText,postflopBarrelPlanProfile,postflopBarrelPlanProfileText,postflopDefensePlanProfile,postflopDefensePlanProfileText,postflopCallFuturePlanProfile,postflopCallFuturePlanProfileText,standardBetSizePct,preflopOpenQuickOptions,raiseOverBetQuickOptions,postflopQuickBetOptions,liveCashRangeProfile,liveCashSpotProfile,liveCashSpotProfileText,liveCashSprProfile,liveCashSprProfileText,liveCashInitiativeProfile,liveCashInitiativeProfileText,liveCashReraisedPotProfile,liveCashReraisedPotProfileText,liveCashMultiwayProfile,liveCashMultiwayProfileText,liveCashRiverDecisionProfile,liveCashRiverDecisionProfileText,tournamentRangeProfile,tournamentFinalTableProfile,tournamentFinalTableStackRole,tournamentFinalTableCollisionProfile,tournamentFinalTableRangeProfile,tournamentFinalTableRangeProfileText,tournamentFinalTablePostflopProfile,tournamentFinalTablePostflopProfileText,tournamentFinalTableLearningPoint,tournamentFinalTableLearningPointText,tournamentHeadsUpProfile};
// [Codex fix 2026-06-05] Query-gated regression output for browser verification without exposing debug UI during normal play.
if(new URLSearchParams(location.search).has('codex_regression')){
  setTimeout(function(){
    const el=document.createElement('pre');
    el.id='codex-regression-output';
    el.style.cssText='position:fixed;left:8px;right:8px;bottom:8px;z-index:99999;max-height:45vh;overflow:auto;background:#fff;border:2px solid #2f6feb;border-radius:8px;padding:10px;font:12px/1.4 ui-monospace,monospace;white-space:pre-wrap';
    try{
      const summary=runFishTankRegressionTests();
      el.textContent=fishTankRegressionReportText(summary);
      el.dataset.ok=summary.ok?'1':'0';
      el.dataset.passed=String(summary.passed);
      el.dataset.total=String(summary.total);
      window.__fishTankRegressionSummary=summary;
    }catch(e){
      el.textContent='Fish Tank 回帰検査 ERROR: '+(e&&e.stack?e.stack:e);
      el.dataset.ok='0';
    }
    document.body.appendChild(el);
  },50);
}

