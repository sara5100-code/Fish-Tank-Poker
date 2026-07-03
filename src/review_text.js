var _analysisFromHistory=false;
function plainReviewText(s){
  return String(s||'').replace(/<[^>]+>/g,'').replace(/【[^】]+】/g,'').replace(/評価メタ:[^。]*。?/g,'').replace(/\s+/g,' ').trim();
}
function firstUsefulSentence(s){
  const txt=plainReviewText(s);
  if(!txt)return'';
  const parts=txt.split('。').map(x=>x.trim()).filter(Boolean);
  const skip=/^(正解|チェック|コール|フォールド|ベット|レイズ|オールイン|Raw EQ|EQ約|EV優位|EV損失|若干|GTOソルバー|推定では|サイズ|評価メタ)/;
  return (parts.find(p=>!skip.test(p))||parts[0]||'').replace(/（Raw EQ約[^）]+）/g,'').replace(/（EQ約[^）]+）/g,'');
}
function boardTextureNaturalText(label,street){
  const t=String(label||'').replace(/\s+/g,'').trim();
  if(t==='完成寄りボード'||t==='動的または完成寄りボード'){
    if(street==='river')return 'フラッシュ・ストレート・フルハウスなどの完成役を確認するリバーです。もう次のカードはないので、ドローは完成したか空振りしたかに分けて考えます';
    return 'フラッシュ・ストレート・ペアなどが完成したり、次のカードで一気に状況が変わりやすいボードです。ワンペアだけで大きく取りに行くより、相手の完成役や強いドローを少し警戒します';
  }
  if(t==='比較的静的なボード'){
    return '大きなドロー完成が少ない静かなボードです。薄いバリューや小さめのベットが通りやすい一方、相手の強い継続には注意します';
  }
  return t;
}
function riverLineNaturalText(label){
  const t=String(label||'').trim();
  if(t==='3バレル')return'相手は3ストリート続けて打っているので、ライブではかなりバリュー寄りに見ます。';
  if(t==='ターン・リバー連続ベット')return'相手はターンとリバーで続けて打っているので、ワンペアはブラフキャッチ寄りに下げます。';
  if(t==='ターンコール後のリバーベット')return'ターンでこちらのベットにコールした相手がリバーで打っているので、完成役や強い継続を少し濃く見ます。';
  if(t==='単発リバーベット')return'相手の圧力はリバーの一度だけなので、小さめならブラフも残りますが、大きいサイズはバリュー寄りに見ます。';
  if(t==='ターンコール後のリバー継続')return'ターンで相手がコールして残った後なので、払ってくれる下の手を具体的に想定します。';
  if(t==='相手チェック後のリバーベット')return'相手がチェックした後なので取り切りや薄バリューを作れますが、完成ボードではサイズを絞ります。';
  if(t==='コールレンジ相手のリバーベット')return'相手は一度以上コールして残っているので、薄いバリューは小さめから考えます。';
  if(t==='リバーレイズ対応')return'こちらのベットにレイズが返った場面なので、相手レンジをかなり強く見ます。';
  if(t==='リバーでこちらがレイズ')return'相手のベットにこちらがレイズする場面で、コールされる相手レンジはかなり強くなります。';
  return t?('ラインは'+t+'です。'):'';
}
function naturalRiskText(risk,actor,street){
  const txt=plainReviewText(risk);
  if(!txt)return'';
  let m=txt.match(/^チェック\s*\/\s*([^\/]+)\s*\/\s*相手圧力(\d+)回/);
  if(m){
    const hand=String(m[1]||'').trim();
    const pressure=+m[2];
    const handText=hand==='非ナッツ強手'
      ?'こちらは強い手ですが、全体ナッツではなく、'
      :hand==='ナッツ級'
        ?'こちらはナッツ級で、'
        :boardTextureNaturalText(hand,street);
    const pressureText=pressure>0
      ?'ここまで相手の圧力が'+pressure+'回入っています。'
      :'相手から強い圧力はまだ入っていません。';
    return handText+pressureText;
  }
  m=txt.match(/(?:サイズ)?(\d+)%pot\s*\/\s*([^\/]+)\s*\/\s*相手圧力(\d+)回/);
  if(m){
    const board=boardTextureNaturalText(m[2],street);
    const pressure=+m[3]>0?'ここまで相手の圧力は'+m[3]+'回入っています。':'ここまで相手の強い圧力は入っていません。';
    const line=(txt.match(/ライン=([^\/。]+)/)||[])[1];
    const lineText=line?riverLineNaturalText(line.trim()):'';
    const tendencyRaw=txt.indexOf('相手傾向=')>=0?txt.split('相手傾向=')[1]:'';
    const tendency=tendencyRaw?tendencyRaw.split(/[\/。]/)[0].trim():'';
    const boardScene=tendency?board.replace(/です。?$/,'')+'で、相手は'+tendency.trim()+'寄りのタイプです':board;
    return (actor||'サイズ')+'は'+m[1]+'%potで、'+boardScene+'。'+pressure+(lineText?' '+lineText:'');
  }
  m=txt.match(/SPR約([^\/]+)\s*\/\s*([^\/]+)\s*\/\s*圧力(\d+)段階/);
  if(m){
    const n=+m[3];
    return 'SPRは約'+m[1].trim()+'、'+boardTextureNaturalText(m[2],street)+'。'
      +(n>0?'ここまで相手の圧力は'+n+'段階入っています。':'ここまで相手の強い圧力はまだ入っていません。');
  }
  return txt.replace(/\s+\/\s+/g,'、');
}
function naturalRecommendationText(rec){
  let r=plainReviewText(rec).replace(/^推奨:\s*/,'').replace(/^候補:\s*/,'').replace(/^相手依存:\s*/,'相手次第では');
  r=r.replace(/^推奨ベット:\s*/,'').replace(/^ベット案:\s*/,'');
  r=r.replace(/^推奨頻度:\s*/,'頻度感は');
  return r;
}
// [Codex fix 2026-06-15] 内部ラベルをそのまま読ませず、コーチが場面を説明する言葉へ変換する。
// [Codex fix 2026-06-17] 内部のレンジ更新メタを、プレイヤーが読んで納得しやすい口語説明へ翻訳する。
function naturalRangeActionUpdateText(ev){
  const p=ev&&ev.rangeActionUpdateProfile;
  if(!p)return'';
  const lane={check:'チェック',call:'コール',bet:'ベット/レイズ',fold:'フォールド'}[p.lane]||p.lane;
  const board=ev.boardTextureProfile||{};
  const isRiver=ev.street==='river'||p.street==='river';
  const completed=!!(board.dynamic||board.flushThreat||board.straightThreat||board.paired||board.transition&&board.transition!=='none');
  const boardNote=completed
    ?(isRiver?'リバーではドローはもう増えません。相手の完成役、空振りしたドローのブラフ、ブラフキャッチ候補を分けて見ます。':'このボードは完成役や強いドローが残りやすいので、ワンペアだけで大きく膨らませる時は慎重に見ます。')
    :'ボード自体は比較的落ち着いているので、相手のアクション量でレンジを更新します。';
  const size=p.sizePct?('サイズは約'+p.sizePct+'%potです。'):'';
  let reason='';
  if(p.rangeState==='capped'){
    reason='相手が先にチェックしているため、強いハンドをすべて持っているというより、強いベット候補の一部は少し減っています。だからこちらが打つなら、小〜中サイズでプレッシャーをかける選択が作りやすいです。';
  }else if(p.rangeState==='mixed_capped_pressure'){
    reason='相手はチェックもしていますが、その後に圧力も入っています。完全に弱いとは見ず、弱いレンジと強い継続レンジが混ざった状態として扱います。';
  }else if(p.rangeState==='single_pressure'){
    reason=isRiver?'相手のリバーベットはまだ一度だけです。バリューだけでなく空振りしたドローのブラフもあり得ますが、サイズと相手傾向で重みを変えます。':'相手のベットはまだ一度だけなので、バリューだけでなくドローや軽いプローブも残ります。ここは即断せず、サイズとこちらの手役で続行頻度を決める場面です。';
  }else if(p.rangeState==='pressure_dense'){
    reason=isRiver?'相手が複数ストリートで打ってリバーまで来ています。ここでは強いバリューと一部のブラフ候補に分けて考えます。特にライブ$2/$5では、このラインの大きいベットはブラフ不足になりやすいです。':'相手が複数ストリートで打っているため、リバーに近づくほどレンジは強いバリューと強いドロー寄りに絞られます。特にライブ$2/$5では、このラインの大きいベットはブラフ不足になりやすいです。';
  }else if(p.rangeState==='turn_call_dense'){
    reason='ターンでこちらのベットにコールした相手は、リバーでペア以上の完成役と、一部の空振りしたドローや強いブロッカーを残します。薄いバリューやブラフは、相手が何でコールしてくれるかを先に考えます。';
  }else{
    reason='この時点では相手レンジはまだ大きく絞り切れていません。手役の強さだけでなく、相手がここまでどのラインで残ったかを見ます。';
  }
  let action='';
  if(p.severity==='good')action=lane+'は自然です。相手レンジの更新と噛み合っています。';
  else if(p.severity==='bad')action=lane+'は危険寄りです。見た目のエクイティより、相手の残っているレンジの強さを優先して見直したいです。';
  else if(p.severity==='border')action=lane+'は境界です。GTOでは混ざることがありますが、実戦では相手のブラフ頻度で大きく変わります。';
  else action=lane+'はサイズと相手傾向込みで判断する場面です。';
  return reason+' '+boardNote+' '+size+' '+action;
}
function naturalBoardTextureDefinitionText(ev){
  const p=ev&&ev.boardTextureProfile;
  if(!p)return'';
  if(p.dynamic||p.flushThreat||p.straightThreat||p.paired||p.transition&&p.transition!=='none'){
    return '「完成寄り/動的ボード」は、フラッシュ・ストレート・フルハウス系、または次のカードで強弱が大きく変わるボードのことです。このタイプでは、トップペアやワンペアの価値を少し低く見積もります。';
  }
  if(p.primary==='dry'||p.primary==='high_dry'){
    return 'このボードは比較的ドライで、強いドローや完成役が少なめです。小さめのベットやチェックでレンジ全体を扱いやすい場面です。';
  }
  return'';
}
function naturalSpotLabel(label){
  const t=String(label||'').trim();
  const map={
    Flat:'レイズに対してコールで参加する場面',
    Open:'自分から最初に参加する場面',
    'Open fold':'自分から参加するか降りるかの場面',
    Limp:'リンプで参加する場面',
    Iso:'リンプに対してレイズする場面',
    'BB defend':'BBでレイズを受ける場面',
    'BB 3bet':'BBから押し返す場面',
    '3BET':'3ベットで主導権を取りに行く場面',
    '4BET対応':'3ベット後にさらに強いレイズを受けた場面',
    '5BET':'4ベット後にさらに押し返す場面',
    '対レイズフォールド':'レイズを受けて続けるか降りるかの場面'
  };
  return map[t]||t;
}
function naturalCoachVerdict(ev){
  if(!ev)return'';
  const a={fold:'フォールド',check:'チェック',call:'コール',raise:(ev.street==='preflop'?'レイズ':'ベット'),bet:'ベット',allin:'オールイン'}[ev.action]||'この判断';
  if(ev.quality==='bad')return a+'は見直したいです。';
  if(ev.quality==='good')return a+'で問題ありません。';
  return'複数のラインが成立します。';
}
// [Codex fix 2026-06-29] 混合戦略の比率を本文内で埋もれさせず、短い一文として残す。
function coachMixRatioSentence(ev){
  const mix=inferredStrategyMixText(ev);
  if(!mix)return'';
  return'頻度感は'+mix+'です。';
}
function mixedLineExplanationText(ev){
  if(!ev||ev.quality!=='ok')return'';
  const rec=naturalRecommendationText(ev.suggest||'');
  const mix=inferredStrategyMixText(ev);
  const ratio=coachMixRatioSentence(ev);
  if(ev.street==='preflop'){
    const lane=(ev.middleProfile&&ev.middleProfile.lane)||(ev.finalTableRangeProfile&&ev.finalTableRangeProfile.lane)||(ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane)||'';
    const openSide=lane==='open'||lane==='openJam'||lane==='sbOpen'||lane==='openFold';
    const defendSide=lane==='bbDefend'||lane==='callOff'||lane==='flat'||lane==='vsRaiseFold';
    if(ev.action==='raise'||ev.action==='allin'){
      if(rec)return'参加して主導権を取るラインと、フォールドして無理なポットを避けるラインが混ざります。サイズは'+rec+ratio;
      return'参加して主導権を取るラインと、フォールドして次のスポットを待つラインが混ざります。'+ratio;
    }
    if(ev.action==='call'||ev.action==='fold'){
      if(openSide){
        if(mix)return'オープンして主導権を取るラインと、フォールドして次のスポットを待つラインが混ざります。'+ratio;
        return'オープンするラインと、フォールドして次のスポットを待つラインがあります。';
      }
      if(defendSide){
        if(mix)return'コールで価格を使うライン、フォールドでドミネートを避けるライン、時々押し返すラインを分けます。'+ratio;
        return'コールで価格を使うラインと、フォールドで難しいポストフロップを避けるラインがあります。';
      }
      if(mix)return'続けるラインと、フォールドして次のスポットを待つラインが混ざります。'+ratio;
      return'続けるラインと、フォールドするラインがあります。';
    }
    if(ev.action==='check'){
      if(mix)return'チェックでフロップを見るラインと、レイズで主導権を取りに行くラインが混ざります。'+ratio;
      return'チェックでフロップを見るラインと、レイズで主導権を取りに行くラインがあります。';
    }
  }
  if(ev.action==='check'){
    if(rec)return'チェックでポットを抑えるラインと、'+rec+'で先に取りに行くラインが混ざります。'+ratio;
    if(mix)return'チェックで実現率を取るラインと、ベットで先にフォールドエクイティを取るラインが混ざります。'+ratio;
    return'チェックで次のカードを見るラインと、小さく打って主導権を取りに行くラインがあります。';
  }
  if(ev.action==='call'||ev.action==='fold'){
    if(mix)return'コールでショーダウン価値を残すラインと、フォールドで大きな損失を避けるラインが混ざります。'+ratio;
    return'コールで受けるラインと、フォールドで損失を抑えるラインがあります。相手のブラフ頻度とサイズで寄せます。';
  }
  if(ev.action==='raise'||ev.action==='bet'||ev.action==='allin'){
    if(rec){
      if(/^check|^チェック/i.test(rec))return'打って取りに行くラインと、チェックでポットを抑えるラインが混ざります。'+rec+'。'+ratio;
      return'打ってバリューやプロテクションを取るラインと、チェックでポットを抑えるラインが混ざります。サイズ感は'+rec+'です。'+ratio;
    }
    if(mix)return'ベットで取りに行くラインと、チェックでショーダウン価値を守るラインが混ざります。'+ratio;
    return'打って相手の弱いレンジから取るラインと、チェックでポットを管理するラインがあります。';
  }
  return'';
}
// [Codex fix 2026-06-14] 短文化後もフロップ/リバーの「なぜ」は残す。
// 補正タグを増やさず、初心者が判断軸を一つ持ち帰れる短い補足だけを足す。
function postflopCoachExtraText(ev){
  if(!ev||ev.street==='preflop')return'';
  if(ev.postflopBetPurposeProfile)return'';
  const profileText=[
    ev.liveCashInitiativeProfile&&ev.liveCashInitiativeProfile.policy,
    ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.policy,
    ev.onePairProfile&&ev.onePairProfile.policy,
    ev.liveCashSprProfile&&ev.liveCashSprProfile.policy,
    ev.liveCashMultiwayProfile&&ev.liveCashMultiwayProfile.policy,
    ev.liveCashReraisedPotProfile&&ev.liveCashReraisedPotProfile.policy
  ].filter(Boolean).join(' ');
  const src=(profileText+' '+(ev.comment||'')+' '+(ev.suggest||'')).replace(/\s+/g,' ');
  const hasReason=/レンジ|主導権|OOP|IP|SPR|サイズ|相手|バリュー|ブラフ|ショーダウン|マルチウェイ|ポジション/.test(src);
  if(ev.street==='flop'&&ev.action==='check'){
    if(hasReason)return'フロップでは、手役の強さだけでなく、主導権・ポジション・後ろのストリートで困るカードを見てチェックかベットを分けます。';
    return'フロップのチェックは弱さだけではありません。ここで無理にポットを作るより、相手の反応とターンカードを見てから判断する選択です。';
  }
  if(ev.street==='flop'&&(ev.action==='raise'||ev.action==='bet'||ev.action==='allin')){
    return'フロップで打つ時は、今すぐ取れるバリューだけでなく、ターン以降に嫌なカードがどれだけあるかもサイズ選びに入れます。';
  }
  if(ev.street==='river'&&ev.action==='check'){
    if(/ナッツ|強い完成役|フルハウス|フラッシュ|ストレート/.test(src))return'リバーの強い手でも、相手が打つレンジを持つ時はチェックで誘う形が混ざります。ただし取り逃しになる相手には自分からサイズを選びます。';
    return'リバーのチェックは、薄いバリューを取りに行くよりショーダウン価値を守る選択です。相手が打ってきた時だけ、サイズとラインから受けるかを決めます。';
  }
  if(ev.street==='river'&&ev.action==='call'){
    return'リバーのコールは、勝っていそうかではなく、相手のベットに必要なブラフ量が本当に残っているかで決めます。';
  }
  if(ev.street==='river'&&ev.action==='fold'){
    return'リバーで降りる判断は、弱気ではなく、相手のラインがバリューに寄りすぎている時に利益を守る技術です。';
  }
  if(ev.street==='river'&&(ev.action==='raise'||ev.action==='bet'||ev.action==='allin')){
    return'リバーで打つ時は、どの下のハンドにコールしてほしいのかを先に決めます。そこから小さめ・中サイズ・大きめを選ぶのが実戦的です。';
  }
  return'';
}
// [Codex fix 2026-06-20] ベット理由を、目的・対象レンジ・サイズの順で読める口語にまとめる。
function naturalPostflopBetPurposeText(ev){
  const p=ev&&ev.postflopBetPurposeProfile;
  if(!p)return'';
  const t=p.targetPlan||{};
  const street=p.street||ev.street||'flop';
  const streetLead=street==='river'
    ?'リバーなので、考えることはバリューかブラフかに絞り'
    :street==='turn'
      ?'ターンでは、残った相手レンジにまだ打つ理由があるかを見て'
      :'フロップでは、レンジCB・プロテクション・セミブラフのどれかを整理して';
  const target=t.target||p.target||'相手の継続レンジ';
  const foldOut=t.foldOut||'弱いレンジ';
  const actual=p.sizePct?String(p.sizePct)+'%pot':'このサイズ';
  const rec=p.recommendedPct?String(p.recommendedPct)+'%pot前後':'ボードと相手レンジに合うサイズ';
  let sizeNote='';
  if(t.sizeFit){
    if(/大きすぎ|重い|降ろしすぎ|狭すぎ|ズレ/.test(t.sizeFit))sizeNote='大きくするほど、払ってほしい弱い手が降りて、強い手だけが残りやすくなります。';
    else if(/小さく|広く|噛み合う|合う|払わせ/.test(t.sizeFit))sizeNote='このサイズなら、狙う相手レンジとおおむね噛み合います。';
  }
  let purposeText='';
  if(p.lane==='value')purposeText='下の完成役や強いワンペアから取り切るバリュー';
  else if(p.lane==='protectionValue'||p.lane==='thinValue')purposeText='下のワンペアやドローから少し取る薄いバリュー/プロテクション';
  else if(p.lane==='weakMadeBet')purposeText='薄いプロテクション';
  else if(p.lane==='semiBluff')purposeText='今すぐ降ろす価値と、コールされても改善する価値を使うセミブラフ';
  else if(p.lane==='rangeCbet')purposeText='レンジ全体の優位を小さく広く使うレンジCB';
  else purposeText='相手が十分に降りるかを確認したいブラフ';
  const advice=naturalRecommendationText(p.suggest||'');
  const opponentNote=p.opponentType&&p.opponentType.postflopNote&&p.opponentType.label!=='標準的'?p.opponentType.postflopNote:'';
  const core=streetLead+'、このベットは'+purposeText+'で、コールしてほしい相手は「'+target+'」、降ろしたい相手は「'+foldOut+'」、今回のサイズは'+actual+'、目安は'+rec+'です。';
  const bluff=p.bluffCandidate||null;
  const bluffNote=bluff
    ?'ブラフ候補として見ると、これは「'+bluff.kind+'」です。'+bluff.policy+' 頻度は'+bluff.frequency+'、サイズは'+bluff.sizeBand+'が目安です。'
    :'';
  return [core,bluffNote,opponentNote,sizeNote,advice].filter(Boolean).join(' ');
}
// [Codex fix 2026-06-20] ベットされた側の説明を、必要勝率・勝っている想定・相手ブラフ量に整理する。
function naturalFacingBetDecisionText(ev){
  if(!ev)return'';
  const rv=ev.liveCashRiverDecisionProfile||null;
  const fp=ev.postflopDefensePlanProfile||null;
  const next=ev.postflopCallFuturePlanProfile||null;
  const p=rv||fp||null;
  if(!p)return'';
  const action={call:'コール',fold:'フォールド',raise:'レイズ',bet:'ベット',allin:'オールイン',check:'チェック'}[ev.action]||ev.action||'判断';
  const sizePct=p.sizePct!=null?p.sizePct:null;
  const required=sizePct!=null?Math.round(sizePct/(100+2*sizePct)*100):null;
  if(rv){
    const lane=rv.lane||'';
    const board=rv.completed?'完成寄りボード':'比較的静的なボード';
    const tendency=rv.opponentTendency&&rv.opponentTendency.label&&rv.opponentTendency.label!=='標準的'?'相手は'+rv.opponentTendency.label+'寄り、':'';
    const line=rv.line&&rv.line.label?riverLineNaturalText(rv.line.label):'';
    let heroPlan='';
    if(lane==='riverOnePairCatch'){
      heroPlan=(line?line+' ':'')+'コールするなら、相手に約'+(required||'十分な')+'%以上のブラフや薄すぎるバリューが必要です。ワンペアで勝っている想定は、空振りブラフや薄いワンペア系のベットです。';
    }else if(lane==='riverDisciplineFold'){
      heroPlan=(line?line+' ':'')+'フォールドは、相手のバリュー密度が必要ブラフ量を上回ると見る判断です。勝っている可能性より、相手ラインにブラフが足りるかを優先します。';
    }else if(lane==='riverRaiseResponse'){
      heroPlan=(line?line+' ':'')+'相手のレイズに続けるには、こちらが上位完成役に十分耐えている必要があります。リバーのレイズは$2/$5ではかなりバリュー寄りに見ます。';
    }else{
      return'';
    }
    const sizeText=sizePct!=null?'リバーで'+(tendency?tendency:'')+'相手の'+sizePct+'%potに対する'+action+'で、必要勝率は約'+required+'%です。':'リバーで相手のベット/レイズに対する'+action+'で、相手のサイズとラインを見ます。';
    return [sizeText,heroPlan,board+'です。',rv.suggest?naturalRecommendationText(rv.suggest):''].filter(Boolean).join(' ');
  }
  const goodTarget=fp.target||'相手のベットレンジ';
  let winPlan='';
  if(fp.isStrong)winPlan='こちらは強い手なので、相手のバリューにもブラフにも十分続けられます。コールだけでなく、取り切るレイズも候補です。';
  else if(fp.strongDraw)winPlan='勝っているというより、完成した時の価値と相手が止まる未来で受けます。外れた時にもう一発大きく打たれたら頻度を落とします。';
  else if(fp.weakDraw)winPlan='弱いドローは完成しても強い手になりにくく、次ストリートでも打たれると苦しいです。安くないなら必要勝率だけで受けない方が自然です。';
  else if(fp.weakMade||fp.strongOnePair)winPlan='ワンペア系で勝っている想定は、相手のCB・薄いバリュー・一部ブラフです。次に嫌なカードが多いなら、今から受ける回数を減らします。';
  else winPlan='ショーダウン価値や改善率が薄い手は、次のベットで押し出されやすいです。';
  const nextPlan=next&&next.plan?next.plan:'';
  const sizeText=sizePct!=null?'相手の'+sizePct+'%potに対する'+action+'で、必要勝率は約'+required+'%です。':'相手のベットに対する'+action+'で、サイズを確認します。';
  const compactPlan=(winPlan+(nextPlan?' '+nextPlan:'')).replace(/。/g,'、').replace(/、$/,'');
  return [sizeText,'続ける根拠は「'+goodTarget+'」で、'+compactPlan,fp.suggest?naturalRecommendationText(fp.suggest):''].filter(Boolean).join(' ');
}
// [Codex fix 2026-06-21] リバーでこちらがレイズする時の説明を、相手の続行レンジとサイズ目的に整理する。
function naturalRiverHeroRaiseText(ev){
  const p=ev&&ev.liveCashRiverDecisionProfile;
  if(!p||p.lane!=='riverHeroRaise')return'';
  const hr=p.heroRaise||{};
  const design=p.betDesign||{};
  const hand=hr.classLabel||'この手';
  const size=p.sizePct!=null?p.sizePct+'%pot':'このサイズ';
  const board=p.completed?'完成寄りボード':'比較的静的なボード';
  if(hr.severity==='good'||p.severity==='good'){
    return [
      '相手のベットにこちらがレイズする場面で、こちらは'+hand+'です。',
      'コールしてほしい相手は「'+(design.target||'下の強い完成役や降りきれない強いワンペア')+'」で、相手レンジはかなり強くなりますが、全体ナッツ級なら取り切りを狙えます。',
      '今回のサイズは'+size+'、目安は'+(design.sizeBand||'2.5〜4倍前後')+'です。'
    ].join(' ');
  }
  return [
    '相手のベットにこちらがレイズする場面で、こちらは'+hand+'です。',
    'コールされる相手は「'+(design.target||'上位完成役や強いブラフキャッチ')+'」に締まり、降ろしたい相手は「'+(design.foldOut||'薄いワンペアや空振り')+'」です。目安は'+(design.sizeBand||'コール止め、または小さめレイズだけ')+'です。',
    board+'では、非ナッツを'+size+'まで大きく上げると、弱い手は降りて強い手だけに続けられやすいです。'
  ].join(' ');
}
function naturalRiverBetDesignText(ev){
  const p=ev&&ev.liveCashRiverDecisionProfile;
  if(!p||!p.betDesign||p.lane==='riverHeroRaise'||p.lane==='riverOnePairCatch'||p.lane==='riverDisciplineFold'||p.lane==='riverRaiseResponse')return'';
  const d=p.betDesign;
  const tendency=p.opponentTendency&&p.opponentTendency.label&&p.opponentTendency.label!=='標準的'?'相手は'+p.opponentTendency.label+'寄りです。':'';
  if(p.lane==='riverThinValueSize'||p.lane==='riverValueTarget'||p.lane==='riverBluffCandidate'){
    return [
      'リバーでこちらが打つ場面です。',
      tendency,
      'コールしてほしい相手は「'+d.target+'」、降ろしたい相手は「'+d.foldOut+'」で、ブロッカーや相手に降りる手が残るかを確認します。サイズ帯は'+d.sizeBand+'です。'+(d.warning||'')
    ].filter(Boolean).join(' ');
  }
  if(p.lane==='riverPotControlCheck'||p.lane==='riverGiveUp'||p.lane==='riverMissedValue'){
    return [
      'リバーの'+(ev.action==='check'?'チェック':'判断')+'です。',
      tendency,
      d.warning||p.policy,
      ev.action==='check'
        ?'薄いバリューやブラフの条件が足りないので、ショーダウン価値を守るか、無理なブラフを作らない判断です。'
        :'ベットするなら、相手にコールしてほしい手と降ろしたい手が十分に残るかを先に確認します。'
    ].filter(Boolean).join(' ');
  }
  return'';
}
function inferredStrategyMixText(ev){
  if(!ev)return'';
  if(ev.strategyMix)return ev.strategyMix;
  const src=(ev.comment||'')+' '+(ev.suggest||'');
  let m=src.match(/bet率約(\d+)%\s*\/\s*check率約(\d+)%/i);
  if(m)return'ベット '+m[1]+'% / チェック '+m[2]+'%';
  m=src.match(/推定bet率約(\d+)%/i);
  if(m)return'ベット '+m[1]+'% / チェック '+(100-(+m[1]))+'%';
  m=src.match(/推定check率約(\d+)%/i);
  if(m)return'チェック '+m[1]+'% / ベット '+(100-(+m[1]))+'%';
  if(ev.freqPct!=null){
    const a={fold:'フォールド',check:'チェック',call:'コール',raise:ev.street==='preflop'?'レイズ':'ベット',allin:'オールイン'}[ev.action]||ev.action;
    let b='別ライン';
    if(ev.action==='check')b='ベット';
    else if(ev.action==='raise'||ev.action==='bet')b='チェック';
    else if(ev.action==='call')b='フォールド';
    else if(ev.action==='fold')b='コール';
    return a+' '+ev.freqPct+'% / '+b+' '+Math.max(0,100-ev.freqPct)+'%';
  }
  if(ev.street==='preflop'){
    const lane=(ev.middleProfile&&ev.middleProfile.lane)||(ev.finalTableRangeProfile&&ev.finalTableRangeProfile.lane)||(ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane)||'';
    if(ev.action==='raise')return'レイズ 50% / フォールド 50%';
    if(ev.action==='allin')return'オールイン 50% / フォールド 50%';
    if(ev.action==='fold'&&(lane==='open'||lane==='openJam'||lane==='openFold'))return'レイズ 50% / フォールド 50%';
    if(ev.action==='call'||ev.action==='fold')return'コール 50% / フォールド 50%';
    if(ev.action==='check')return'チェック 50% / レイズ 50%';
  }
  if(ev.action==='call'||ev.action==='fold')return'コール 50% / フォールド 50%';
  if(ev.action==='check'||ev.action==='raise'||ev.action==='bet')return'チェック 50% / ベット 50%';
  return'';
}
// [Codex fix 2026-06-16] GTO理論の3番/4番を細かく持つための公開情報スナップショット。
// 相手の実ハンドは使わず、公開ボード・公開アクション・既存レンジ推定から、ボード分類とレンジ更新を文章化する。
function gtoActionJP(action,street){
  return {fold:'フォールド',check:'チェック',call:'コール',bet:'ベット',raise:street==='preflop'?'レイズ':'ベット/レイズ',allin:'オールイン'}[action]||action||'判断';
}
function gtoBoardClassText(ev){
  if(!ev||ev.street==='preflop')return '';
  if(ev.boardTextureProfile)return boardTextureProfileText(ev.boardTextureProfile);
  const src=[ev.comment,ev.evalAxis,ev.liveCashRiverDecisionProfile&&ev.liveCashRiverDecisionProfile.risk,ev.onePairProfile&&ev.onePairProfile.risk].filter(Boolean).join(' ');
  const tags=[];
  if(/モノトーン|4枚同色|フラッシュ完成|フラッシュ/.test(src))tags.push('同色圧が高い');
  else if(/2トーン|同色ターン|フラッシュドロー/.test(src))tags.push('フラッシュドローあり');
  if(/ストレート完成|ストレート/.test(src))tags.push('ストレート接続');
  if(/ペアド|ボードペア|ペアボード|フルハウス|クアッズ/.test(src))tags.push('ペアボード');
  if(/マルチウェイ|way/.test(src)||(ev.streetOpps!=null&&ev.streetOpps>=2))tags.push('マルチウェイ');
  if(/完成寄り|動的/.test(src))tags.push('完成寄り/動的');
  if(/比較的静的|ドライ|静かな/.test(src))tags.push('静的');
  if(!tags.length){
    if(ev.street==='flop')tags.push('標準フロップ');
    else if(ev.street==='turn')tags.push('ターンでレンジが絞られる場面');
    else tags.push('リバーのショーダウン判断');
  }
  const uniq=tags.filter(function(t,i){return tags.indexOf(t)===i;}).slice(0,4);
  const explain={
    '同色圧が高い':'フラッシュ完成や強いフラッシュドローを相手レンジに残します',
    'フラッシュドローあり':'同色ターン/リバーでワンペアの価値が下がります',
    'ストレート接続':'Jx・8x・連結カードなどが強くなりやすい形です',
    'ペアボード':'トリップス/フルハウスがあり、単なるフラッシュやストレートの価値を少し下げます',
    'マルチウェイ':'ブラフ頻度を落とし、バリュー寄りに評価します',
    '完成寄り/動的':'次のアクションで強い完成役が多く残ります',
    '静的':'薄いバリューや小さめのベットが通りやすい形です',
    '標準フロップ':'手役・主導権・ポジションで頻度を分けます',
    'ターンでレンジが絞られる場面':'ターンの継続で弱いレンジが少し落ちます',
    'リバーのショーダウン判断':'ベット/コールは相手レンジのバリュー密度を重く見ます'
  };
  return uniq.map(function(t){return t+'：'+(explain[t]||'公開情報からの分類です');}).join(' / ');
}
function gtoRangeUpdateText(ev){
  if(!ev)return '';
  const parts=[];
  const street=ev.street||'';
  const action=ev.action||'';
  const range=ev.rangeAdv?('レンジ優位は'+ev.rangeAdv):'レンジ優位は不明';
  const nut=ev.nutAdv?('ナッツ優位は'+ev.nutAdv):'ナッツ優位は不明';
  const eq=ev.effectiveEqPct!=null?('実効EQ '+ev.effectiveEqPct+'%'):(ev.rawEqPct!=null?('Raw EQ '+ev.rawEqPct+'%'):'EQ未推定');
  parts.push(range+'、'+nut+'、'+eq);
  if(ev.liveCashInitiativeProfile){
    parts.push('主導権：'+(ev.liveCashInitiativeProfile.policy||ev.liveCashInitiativeProfile.label||'公開アクションから更新'));
  }
  if(ev.liveCashReraisedPotProfile){
    parts.push('3BET/4BET後：'+(ev.liveCashReraisedPotProfile.policy||ev.liveCashReraisedPotProfile.label||'レンジを強めに更新'));
  }
  if(ev.liveCashMultiwayProfile){
    parts.push('複数人：'+(ev.liveCashMultiwayProfile.policy||ev.liveCashMultiwayProfile.label||'継続レンジを強めに更新'));
  }
  if(ev.liveCashRiverDecisionProfile){
    parts.push('リバー：'+(ev.liveCashRiverDecisionProfile.policy||ev.liveCashRiverDecisionProfile.label||'ベットサイズでレンジを更新'));
  }
  if(ev.rangeActionUpdateProfile){
    parts.push(rangeActionUpdateProfileText(ev.rangeActionUpdateProfile));
  }
  if(street!=='preflop'){
    if(action==='check')parts.push('チェック後は相手の強いベットレンジをまだ残し、こちらのレンジはややキャップされます');
    else if(action==='bet'||action==='raise'||action==='allin')parts.push(street==='river'?'こちらがリバーで打つと、相手の続行レンジはコールできるペア以上・完成役・一部のブラフキャッチ候補に締まります':'こちらが打つと、相手の続行レンジはペア以上・強いドロー寄りに締まります');
    else if(action==='call')parts.push(street==='river'?'リバーでコールすると、こちらはブラフキャッチできる完成役を残すレンジになります':'コールすると、こちらは中程度の完成役/ドローを多く残すレンジになります');
    else if(action==='fold')parts.push('フォールドは低実現率の部分を捨てるレンジ更新です');
  }
  return parts.filter(Boolean).slice(0,4).join('。');
}
function gtoLiveAdjustmentText(ev){
  if(!ev)return '';
  if(ev.tournamentPhase||ev.tournamentContext){
    if(ev.bubbleProfile)return '実戦補正では、バブル付近はチップEVより生存率とカバー関係を重く見ます';
    if(ev.finalTableProfile||ev.finalTableRangeProfile)return '実戦補正では、FTはスタック役割と衝突相手を重く見ます';
    if(ev.headsUpProfile)return '実戦補正では、HUはレンジが広くなるため過度に待ちすぎません';
    return '実戦補正では、BBアンティと有効BBに合わせてサイズと押し引きを調整します';
  }
  if(ev.street==='river'&&(ev.action==='call'||ev.action==='fold'))return '実戦補正では、$2/$5のリバー大きめベットはブラフ不足に寄せて見ます';
  if(ev.liveCashMultiwayProfile||ev.streetOpps>=2)return '実戦補正では、マルチウェイはブラフ頻度を落としてバリュー寄りに見ます';
  if(ev.liveCashInitiativeProfile)return '実戦補正では、OOPからのドンクや薄いスタブを控えめに見ます';
  if(ev.liveCashSprProfile)return '実戦補正では、深いSPRのワンペアはポット管理を重く見ます';
  if(ev.street==='preflop')return '実戦補正では、レーキ・OOP・ドミネートリスクで非BBコールをやや締めます';
  return '実戦補正では、相手のコール過多/ブラフ不足を少し加味します';
}
function gtoTheorySnapshot(ev){
  if(!ev)return null;
  const mix=inferredStrategyMixText(ev);
  const board=gtoBoardClassText(ev);
  const rangeUpdate=gtoRangeUpdateText(ev);
  const liveAdjustment=gtoLiveAdjustmentText(ev);
  const action=gtoActionJP(ev.action,ev.street);
  const recommendation=ev.suggest?naturalRecommendationText(ev.suggest):(ev.quality==='bad'?'別ラインを優先':ev.quality==='good'?action+'継続':'相手傾向で混合');
  const confidence=(ev.rangeAdv&&ev.nutAdv&&ev.effectiveEqPct!=null)?'中〜高':(ev.street==='preflop'?'中':'中');
  return{
    baselineType:'approx-gto-public-info',
    mix:mix||'単一路線寄り',
    boardClass:board,
    boardTexture:ev.boardTextureProfile||null,
    boardTextureMix:ev.boardTextureMixProfile||null,
    boardTextureSize:ev.boardTextureSizeProfile||null,
    boardTextureTransition:ev.boardTextureTransitionProfile||null,
    rangeNutAdvantage:ev.rangeNutAdvantageProfile||null,
    rangeActionUpdate:ev.rangeActionUpdateProfile||null,
    rangeUpdate:rangeUpdate,
    liveAdjustment:liveAdjustment,
    recommendation:recommendation,
    confidence:confidence
  };
}
function attachGtoTheorySnapshot(ev){
  if(!ev)return ev;
  ev.gtoTheory=gtoTheorySnapshot(ev);
  return ev;
}
function gtoTheoryReviewText(ev){
  const g=ev&&ev.gtoTheory;
  if(!g)return'';
  const chunks=[];
  const rangeBits=String(g.rangeUpdate||'').split('。').map(function(x){return x.trim();}).filter(Boolean);
  const rangeShort=rangeBits.length>1?rangeBits[0]+'。'+rangeBits[rangeBits.length-1]:(rangeBits[0]||'');
  if(g.mix)chunks.push('GTO基準は'+g.mix);
  if(g.boardClass&&ev.street!=='preflop')chunks.push('ボードは'+g.boardClass);
  if(rangeShort)chunks.push('レンジ更新は'+rangeShort);
  if(g.liveAdjustment)chunks.push(g.liveAdjustment);
  if(g.recommendation)chunks.push('今回の推奨は'+g.recommendation);
  return chunks.slice(0,4).join('。')+'。';
}
// [Claude fix 2026-06-09] プリフロップフォールドのコメントから手とポジションを自然な文で取り出す
// 例: "正解。K7o（...）のCOレイズへのフォールド。" → "K7oのCOレイズへのフォールド"
//     "正解。K7o（...）はUTGのオープンレンジ外..." → "K7oでのUTGからのフォールド"
function extractFoldContext(comment){
  if(!comment)return null;
  const clean=comment.replace(/^(正解。|概ね正解。|【[^】]+】\s*)/,'');
  // 括弧内のランク情報を除去
  const stripped=clean.replace(/（[^）]*）/g,'');
  const handM=stripped.match(/^([A-Za-z0-9+]+)/);
  if(!handM)return null;
  const hand=handM[1];
  // "K7oのCOレイズへのフォールド" or "K7oのSBフォールド" (ポジション名が英大文字)
  const m1=stripped.match(/の([A-Z][A-Z+0-9]*)(レイズへのフォールド|フォールド)/);
  if(m1)return hand+'の'+m1[1]+m1[2];
  // "K7oはUTGの..." → ポジション特定してフォールドと明示
  const m2=stripped.match(/は([A-Z][A-Z+0-9]*)の/);
  if(m2)return hand+'での'+m2[1]+'からのフォールド';
  // "T8sのリンプポットフォールド" など日本語混じりのフォールドフレーズ
  const m3=stripped.match(/の(.{0,15}フォールド)/);
  if(m3)return hand+'の'+m3[1];
  return hand+'のフォールド';
}
// [Codex fix 2026-06-17] プリフロップのコーチコメントは詳細メタをそのまま出さず、結論・理由・目安頻度に整理する。
function readableStrategyMixText(ev){
  let mix=String(ev&&ev.strategyMix||'').trim();
  if(!mix){
    const src=String(ev&&ev.comment||'');
    const m=src.match(/(?:Fold|Call|Open|Raise|3bet|3BET|4bet|4BET)[^。]{0,90}%/);
    if(m)mix=m[0];
  }
  if(!mix||/[縺繝蛻]/.test(mix))return'';
  mix=mix
    .replace(/\bFold\b/g,'フォールド')
    .replace(/\bCall\/defend\b/g,'コール/ディフェンス')
    .replace(/\bCall\b/g,'コール')
    .replace(/\bOpen\b/g,'オープン')
    .replace(/\bRaise\b/g,'レイズ')
    .replace(/\b3bet\b/gi,'3ベット')
    .replace(/\b4bet\b/gi,'4ベット')
    .replace(/\s*\/\s*/g,' / ');
  return '頻度の目安は '+mix+' です。';
}
function cleanPreflopRecText(rec){
  rec=naturalRecommendationText(rec||'');
  if(!rec||/[縺繝蛻]/.test(rec))return'';
  rec=rec.replace(/^推奨[:：]\s*/,'').trim();
  return rec;
}
function preflopCoachSummaryText(ev,action,rec){
  if(!ev||ev.street!=='preflop'||!ev.liveCashSpotProfile)return'';
  const p=ev.liveCashSpotProfile;
  const label=String(p.label||'');
  const lane=String(p.lane||'');
  const comment=String(ev.comment||'');
  const isBB=lane==='bbDefend'||/^BB\b|BB defend/.test(label)||(/BBディフェンス/.test(comment)&&!/非BB/.test(comment));
  const isFlat=lane==='flat'||/flat/i.test(label)||/コールドコール|非BB|フラット/.test(comment);
  const isOpen=lane==='open'||/open/i.test(label);
  const isOpenFold=lane==='openFold';
  const isVsRaiseFold=lane==='vsRaiseFold';
  const isLimp=/limp|Limp|リンプ/.test(lane+' '+label+' '+comment);
  const recText=cleanPreflopRecText(rec);
  const mixText=readableStrategyMixText(ev);
  let head='';
  let reason='';
  let advice='';
  if(ev.quality==='good'&&ev.action==='fold'){
    head='このフォールドは良い判断です。';
    if(isOpenFold)reason='今のポジションから無理に参加すると、後ろに強いハンドで入られたり、弱いワンペアで難しい判断になりやすいです。';
    else if(isVsRaiseFold||isFlat)reason='レイズに対してコールするには、ポジション・ドミネート耐性・実現率が足りません。見た目より利益にしにくいハンドです。';
    else reason='レンジ外の弱いハンドで無理に参加しないことが、後の難しい判断を減らします。';
    advice='このまま降りて問題ありません。';
  }else if(ev.quality==='bad'){
    if(isBB){
      head='BBでも少し守りすぎです。';
      reason='フロップ前のBBディフェンスです。BBはポットオッズが良いので広く守れますが、UTGオープン相手のように相手レンジが強い時は防衛目安をかなり絞ります。OOPで実現率を落としやすく、弱いトップペアやキッカー負けで払いすぎる形になりやすいです。';
    }else if(isFlat){
      head='ここはフォールド寄りです。';
      reason='非BBでレイズにコールすると、後ろのプレイヤー・ポジション・ドミネートの影響が大きく、オフスートブロードウェイはトップペアでも上位キッカーに負けやすいです。';
    }else if(isLimp){
      head='オープンリンプは見直したいです。';
      reason='参加するなら主導権を取るレイズか、最初からフォールドに整理したい場面です。リンプすると後ろからアイソレイズされ、悪いポジションで難しいポットになりやすいです。';
    }else if(isOpen){
      head='この参加レンジは広すぎます。';
      reason='早いポジションほど後ろに強いハンドが残るため、ハンドの見た目より実現率とドミネートリスクを優先します。';
    }else{
      head='ここは見直したい判断です。';
      reason='フロップ前は、手札の強さだけでなく、ポジション・後続人数・相手レンジに対する実現率まで含めて参加可否を決めます。';
    }
    advice=recText?('推奨は '+recText+' です。'):'まずはフォールド寄りに整理してください。';
  }else{
    head='ここは混合寄りの場面です。';
    if(isBB)reason='BBは価格が良いので守る候補は増えますが、OOPで実現率が下がるぶん、相手のポジションとサイズで頻度を調整します。';
    else if(isFlat)reason='コールも少し混ざりますが、非BBのフラットはドミネートと後続スクイーズの影響を受けます。相手が広い時だけ採用し、標準はフォールドか3ベット寄りに整理します。';
    else reason='GTOでは頻度が割れることがあります。実戦では相手の広さ、後ろのプレイヤー、サイズを見て寄せます。';
    advice=recText?('今回の目安は '+recText+' です。'):'相手傾向で頻度を寄せる場面です。';
  }
  return [head,reason,mixText,advice].filter(Boolean).join(' ').replace(/\s+/g,' ').trim();
}
function recommendationClose(action,quality,rec,hasSuggest){
  rec=naturalRecommendationText(rec);
  if(quality==='bad'){
    const cut=rec.indexOf('。');
    const first=(cut>=0?rec.slice(0,cut):rec).trim();
    const rest=(cut>=0?rec.slice(cut+1).trim():'');
    let phrase=first;
    if(/寄り$/.test(phrase))phrase+='が推奨されます';
    else if(!/(です|ます|する|しない|絞る|混ぜる|選ぶ)$/.test(phrase))phrase+='を検討してください';
    return action+'は少し危ない選択です。'+phrase+'。'+(rest?rest+'。':'');
  }
  if(quality==='good'){
    if(!hasSuggest)return action+'はこのままで問題ありません。';
    if(/^(このライン|このまま|継続|コール可|チェックで|フォールドで|レイズで|ベットで)/.test(rec))return rec;
    return'次も'+rec;
  }
  return action+'は許容できます。次に同じ場面が来たら、'+rec+'も意識してください。';
}
// [Codex fix 2026-06-18] 評価軸ごとの文章を最後に整え、重複と硬いメタ表現を減らす。
function polishCoachReviewText(txt,ev){
  txt=String(txt||'').replace(/\s+/g,' ').trim();
  if(!txt)return'';
  txt=txt
    .replace(/ここは見直したい判断です。リングゲームのリバーです。/g,'リングゲームのリバーで、見直したい判断です。')
    .replace(/ここは見直したい判断です。リングゲームで、/g,'リングゲームで、見直したい判断です。')
    .replace(/ここは複数の選択肢があります。/g,'複数のラインが成立します。')
    .replace(/ここは混合寄りの場面です。/g,'混合戦略になる場面です。')
    .replace(/ベット\/レイズ/g,'ベットまたはレイズ')
    .replace(/GTOでは混ざることがありますが、実戦では/g,'理論上は混ざりますが、実戦では')
    .replace(/許容できます。次に同じ場面が来たら、(.+?)も意識してください。/g,'許容範囲です。次は$1も候補にしてください。')
    .replace(/このボードは完成役や強いドローが残りやすいので、/g,'このボードでは完成役や強いドローを意識して、')
    .replace(/このボードは比較的落ち着いているので、/g,'ボードは比較的落ち着いているので、')
    .replace(/完成寄りボードです。/g,'完成役が多いボードです。')
    .replace(/動的または完成寄りボード/g,'完成役が多い、または次のカードで強弱が大きく変わるボード')
    .replace(/見た目のエクイティより、相手の残っているレンジの強さを優先して見直したいです。/g,'手の強さだけでなく、相手に残る強いレンジを優先して見直します。')
    .replace(/チェックはこのままで問題ありません。SDVはチェックバック多め。/g,'ショーダウン価値を守るチェックバックが自然です。')
    .replace(/チェックはこのままで問題ありません。/g,'')
    .replace(/フォールドで問題ありません。([^。]+。)*?フォールドはこのままで問題ありません。/g,function(m){return m.replace(/フォールドはこのままで問題ありません。/,'');})
    .replace(/相手圧力0回/g,'相手から強い圧力はまだ入っていません')
    .replace(/相手傾向=標準的/g,'');
  if(ev&&ev.street==='preflop'){
    const lane=(ev.middleProfile&&ev.middleProfile.lane)||(ev.finalTableRangeProfile&&ev.finalTableRangeProfile.lane)||(ev.liveCashSpotProfile&&ev.liveCashSpotProfile.lane)||'';
    if(lane==='open'||lane==='openJam'||lane==='openFold'){
      txt=txt.replace(/次はコール検討/g,'次は参加検討').replace(/コールはかなり低頻度/g,'コールではなく、参加するならレイズ寄り');
    }
  }
  const raw=txt.match(/[^。]+。?/g)||[txt];
  const out=[];
  const seen=new Set();
  raw.forEach(function(s){
    s=s.trim();
    if(!s)return;
    if(s.slice(-1)!=='。')s+='。';
    const key=s
      .replace(/\d+%pot/g,'X%pot')
      .replace(/\d+%/g,'X%')
      .replace(/[、。]/g,'')
      .replace(/今回|ここ|この場面|同じ場面/g,'')
      .trim();
    if(seen.has(key))return;
    if(out.length>=6&&/(GTO|理論上|ボード|レンジ更新|定義|候補)/.test(s))return;
    seen.add(key);
    out.push(s);
  });
  let visible=out;
  if(ev&&ev.street!=='preflop'){
    const mustKeep=/推奨|候補|頻度|サイズ|フォールド|コール|チェック|ベット|オールイン|問題ありません|見直し|許容範囲/;
    const ratioKeep=/頻度|ベット\s*\d+%|チェック\s*\d+%|コール\s*\d+%|フォールド\s*\d+%|レイズ\s*\d+%|Raise\s*\d+%|Open\s*\d+%/;
    const first=visible.slice(0,3);
    const ratio=visible.slice(3).find(function(s){return ratioKeep.test(s);});
    const tail=visible.slice(3).filter(function(s){return s!==ratio&&mustKeep.test(s);}).slice(0,1);
    visible=first.concat(ratio?[ratio]:[],tail);
  }
  let joined=visible.join('');
  if(ev&&ev.street==='river'){
    joined=joined.replace(/強いドローが残りやすい/g,'完成役やブラフ候補が残りやすい');
    joined=joined.replace(/フラッシュドロー|ストレートドロー/g,function(x){return x.replace('ドロー','の空振り候補');});
  }
  return joined.replace(/。。+/g,'。').trim();
}
function coachReviewText(ev){
  if(!ev)return'';
  const action={fold:'フォールド',check:'チェック',call:'コール',raise:(ev.street==='preflop'?'レイズ':'ベット'),allin:'オールイン'}[ev.action]||ev.action;
  // [Claude fix 2026-06-09] let に変更: liveCashSpotProfileなど場面別により具体的な verdict を後で上書き
  let verdict=naturalCoachVerdict(ev);
  let scene='';
  let reason='';
  let rec=ev.suggest||'';
  if(ev.headsUpRiverProfile){
    const p=ev.headsUpRiverProfile;
    const actor=p.lane==='call'?'相手のベット':p.lane==='bet'?'今回のベット':'サイズ';
    scene='HUのリバーです。'+naturalRiskText(p.risk,actor,'river');
    reason=p.policy;
  }else if(ev.finalTablePostflopProfile){
    const p=ev.finalTablePostflopProfile;
    const actor=p.lane==='call'?'相手のベット':p.lane==='bet'?'今回のベット':'サイズ';
    scene='FTのポストフロップです。'+naturalRiskText(p.risk,actor);
    reason=p.policy;
  }else if(ev.finalTableRangeProfile){
    const p=ev.finalTableRangeProfile;
    scene='FTのフロップ前です。';
    reason=tournamentFinalTableRangeProfileText(p)+(p.severity==='bad'?' この立場では受けるレンジをかなり絞りたいところです。':'');
  }else if(ev.finalTableProfile){
    const p=ev.finalTableProfile;
    scene='FTで、'+(p.stackRole||'このスタック')+'として動く場面です。';
    reason=p.policy||tournamentFinalTableProfileText(p);
  }else if(ev.earlyMultiwayProfile&&ev.street!=='preflop'){
    // [Claude fix 2026-06-07] ポストフロップ専用: 序盤マルチウェイ
    const p=ev.earlyMultiwayProfile;
    scene='序盤マルチウェイのポストフロップです。';
    reason=p.policy+' '+naturalRiskText(p.risk);
  }else if(ev.earlyDeepSprProfile&&ev.street!=='preflop'){
    // [Claude fix 2026-06-07] ポストフロップ専用: 序盤深SPR
    const p=ev.earlyDeepSprProfile;
    scene='序盤の深いSPRの場面です。';
    reason=p.policy+' '+naturalRiskText(p.risk);
  }else if(ev.bubbleProfile&&ev.street==='preflop'){
    // [Claude fix 2026-06-07] プリフロップ限定: バブル立場はPF専用
    const p=ev.bubbleProfile;
    scene='バブル付近で、'+p.archetype+'の立場です。';
    reason=p.policy+' '+naturalRiskText(p.risk);
  }else if(ev.middleProfile&&ev.street==='preflop'){
    // [Claude fix 2026-06-07] プリフロップ限定: 中盤帯のopen/reshove/flatはPF専用
    const p=ev.middleProfile;
    scene=tournamentMiddleProfileText(p);
    reason='';
  }else if(ev.earlyProfile&&ev.street==='preflop'){
    // [Claude fix 2026-06-07] プリフロップ限定: 序盤参加判断はPF専用
    const p=ev.earlyProfile;
    scene='序盤の参加判断です。';
    reason=(p.participationLeak||p.verdict)+'。'+(p.recommendedRoute?' 参加するなら'+p.recommendedRoute+'に整理したいです。':'');
  }else if(ev.headsUpProfile){
    const p=ev.headsUpProfile;
    scene='HUで、'+p.verdict+'がテーマになる場面です。';
    reason=p.policy+' '+naturalRiskText(p.risk);
  }else if(ev.liveCashRiverDecisionProfile){
    const p=ev.liveCashRiverDecisionProfile;
    const actor=p.lane==='riverRaiseResponse'?'相手のレイズ':p.lane==='riverHeroRaise'?'今回のレイズ':p.lane==='riverOnePairCatch'||p.lane==='riverDisciplineFold'?'相手のベット':p.lane==='riverThinValueSize'||p.lane==='riverBluffCandidate'||p.lane==='riverValueTarget'?'今回のベット':'この判断';
    const tendencyText=p.opponentTendency&&p.opponentTendency.label&&p.opponentTendency.label!=='標準的'?'相手は'+p.opponentTendency.label+'寄りです。':'';
    const blockerText=p.blocker&&p.blocker.coach?p.blocker.coach:'';
    const heroRaiseText=p.lane==='riverHeroRaise'?naturalRiverHeroRaiseText(ev):'';
    const riverBetDesignText=naturalRiverBetDesignText(ev);
    const facingText=(p.lane==='riverOnePairCatch'||p.lane==='riverDisciplineFold'||p.lane==='riverRaiseResponse')?naturalFacingBetDecisionText(ev):'';
    scene=heroRaiseText||facingText||riverBetDesignText||('リングゲームのリバーです。'+tendencyText+naturalRiskText(p.risk,actor,'river')+(blockerText?blockerText:''));
    reason=(heroRaiseText||facingText||riverBetDesignText)?'':p.policy;
  }else if(ev.postflopRaisePlanProfile){
    const p=ev.postflopRaisePlanProfile;
    scene=p.text;
    reason=p.suggest||'';
  }else if(ev.postflopBarrelPlanProfile){
    const p=ev.postflopBarrelPlanProfile;
    scene='ターンの継続ベット判断です。フロップで打って相手にコールされた後、ターンカードで続ける理由が残っているかを見ます。';
    reason=p.policy+' 狙う相手は「'+p.target+'」です。'+(p.suggest?' '+p.suggest:'');
  }else if(ev.postflopCallFuturePlanProfile){
    const p=ev.postflopCallFuturePlanProfile;
    const facingText=naturalFacingBetDecisionText(ev);
    scene=facingText||'コールした後の次ストリート計画です。今の価格だけでなく、次に続けやすいカードと降りるカードを分けます。';
    reason=facingText?'':p.policy+' '+p.plan+(p.suggest?' '+p.suggest:'');
  }else if(ev.postflopDefensePlanProfile){
    const p=ev.postflopDefensePlanProfile;
    const facingText=naturalFacingBetDecisionText(ev);
    scene=facingText||'相手のベットに対する受け方です。必要EQだけでなく、次のストリートでどれだけ実現できるかまで見ます。';
    reason=facingText?'':p.policy+' 相手レンジは「'+p.target+'」として見ます。'+(p.suggest?' '+p.suggest:'');
  }else if(ev.postflopBetPurposeProfile){
    const p=ev.postflopBetPurposeProfile;
    scene=ev.streetLabel||ev.street;
    scene=naturalPostflopBetPurposeText(ev)||'ポストフロップのベット判断です。';
    reason='';
  }else if(ev.liveCashSpotProfile){
    const p=ev.liveCashSpotProfile;
    // [Claude fix 2026-06-09] openFold/vsRaiseFold: ev.commentから手とポジションを取り出して自然な場面説明に変換
    if(p.lane==='openFold'||p.lane==='vsRaiseFold'){
      const foldCtx=extractFoldContext(ev.comment);
      scene=(foldCtx||p.label)+'。';
      // 場面説明の中に判断の根拠を組み込む（汎用的な「この場面では正しい判断」を上書き）
      if(ev.quality==='good'){
        verdict=p.lane==='openFold'
          ?'オープンレンジ外の弱いハンドでの正しい判断です。'
          :'コールレンジ外の弱いハンドでの正しい判断です。';
      }else if(ev.quality==='bad'){
        verdict=p.lane==='openFold'
          ?'このポジションなら参加できるハンドです。改善の余地があります。'
          :'コールレンジ内の可能性があります。見直しが必要です。';
      }
    }else{
      scene=ev.street==='preflop'
        ?'リングゲームのフロップ前で、'+naturalSpotLabel(p.label)+'です。'
        :'リングゲームで、'+naturalSpotLabel(p.label)+'がテーマになる場面です。';
    }
    reason=p.policy+' '+naturalRiskText(p.risk);
  }else if(ev.onePairProfile){
    const p=ev.onePairProfile;
    // [Claude fix 2026-06-09] board_pair のオーバーカードはワンペア管理ではなくレンジCB/セミブラフ局面。
    // isBoardPairOvercard=true: KJ on 774 のようにホールカードが絡まないPFRのCB場面
    // weakPair(非overcard): アンダーペア/ボードペア等のポット管理場面
    if(p.isBoardPairOvercard){
      scene='ペアドボードでホールカードが絡まないオーバーカード。ワンペア管理ではなくレンジ優位を活かすCB局面です。';
    }else if(p.weakPair){
      if(p.pairTier==='board_pair'){
        scene='ボードのペアにキッカーが乗るだけで、ホールカードは実質未絡みの場面です。';
      }else if(p.pairTier==='under_pair'){
        scene='ポケットペアはありますが、ボードの上位カードに負けている下のペアです。セットになっていないので、強い圧力には慎重に扱います。';
      }else{
        scene='弱めのワンペアです。ショーダウン価値はありますが、大きなポットを作るよりポット管理が中心です。';
      }
    }else if(p.strongOnePair){
      // [Claude fix 2026-06-10] isBoardCompletedTP(KK66型)等のTPTK場面は専用テキスト
      scene='トップペア相当のハンドで、相手のサイズとラインにどこまで耐えるかが鍵です。';
    }else{
      scene='ワンペアをどこまで信じるかがテーマです。';
    }
    reason=p.policy+' '+naturalRiskText(p.risk);
  }else{
    scene=firstUsefulSentence(ev.comment)||'この場面の判断です。';
    reason='';
  }
  const inferredMix=inferredStrategyMixText(ev);
  if(!rec&&inferredMix&&(ev.isMix||ev.quality==='ok'))rec='推奨頻度: '+inferredMix;
  else if(rec&&inferredMix&&(ev.isMix||ev.quality==='ok')&&!/(\d+%|頻度|Fold|Call|Raise|3bet|ベット|チェック|コール|フォールド).*\d+%/.test(rec)){
    rec+='。推奨頻度: '+inferredMix;
  }
  if(!rec){
    if(ev.quality==='bad')rec='別のアクションを推奨します';
    else if(ev.quality==='good')rec='このラインを継続してください';
    else rec='相手傾向とサイズを見て使い分けてください';
  }
  rec=naturalRecommendationText(rec);
  const preflopCompact=preflopCoachSummaryText(ev,action,rec);
  if(preflopCompact)return polishCoachReviewText(preflopCompact,ev);
  const close=recommendationClose(action,ev.quality,rec,!!ev.suggest);
  const mixedLineExtra=mixedLineExplanationText(ev);
  const postflopExtra=postflopCoachExtraText(ev);
  // 通常表示では評価軸の詳細を全部つながず、結論・理由・実戦アドバイスへ圧縮する。
  // GTOスナップショットやボード定義は評価JSON/監査側に残し、レビュー欄の長文化を防ぐ。
  const rawText=(verdict+' '+scene+(reason?' '+reason:'')+(mixedLineExtra?' '+mixedLineExtra:'')+(postflopExtra?' '+postflopExtra:'')+' '+close)
    .replace(/プリフロップ/g,'フロップ前')
    .replace(/\s+/g,' ')
    .replace(/。。+/g,'。')
    .trim();
  return polishCoachReviewText(rawText,ev);
}
function compactReviewDetailsHTML(ev,metaHTML){
  if(!metaHTML)return'';
  // [Codex fix 2026-06-12] 評価軸は裏側で使い、ユーザーには口語コメントへ統合する。
  // 詳細データを開かないと理由が分からない状態を避けるため、レビュー画面では非表示にする。
  return '';
}
function escapeHTML(s){
  return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});
}
function splitCoachReviewForMobile(txt){
  txt=String(txt||'').trim();
  if(txt.length<=230)return{lead:txt,extra:''};
  const marks=['。','！','？','縲・'];
  let hits=[];
  for(const m of marks){
    let pos=-1;
    while((pos=txt.indexOf(m,pos+1))>=0)hits.push(pos+m.length);
  }
  hits=[...new Set(hits)].sort(function(a,b){return a-b;});
  let cut=hits.find(function(p,i){return i>=1&&p>=90&&p<=240;})||hits.find(function(p){return p>=140;})||220;
  cut=Math.min(cut,Math.max(120,txt.length-60));
  return{lead:txt.slice(0,cut).trim(),extra:txt.slice(cut).trim()};
}
function coachReviewHTML(ev){
  const txt=coachReviewText(ev);
  const parts=splitCoachReviewForMobile(txt);
  if(!parts.extra)return escapeHTML(parts.lead);
  return '<span class="coach-lead">'+escapeHTML(parts.lead)+'</span>'
    +'<details class="coach-more"><summary></summary><div class="coach-more-body">'+escapeHTML(parts.extra)+'</div></details>';
}
