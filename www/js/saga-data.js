/* 초공간 차원 붕괴 — 성좌 서사 데이터 (인물 · 사건 · 전조)
 * 성좌 번호: 0 오리온 · 1 리라 · 2 카시오페이아 · 3 페가수스 · 4 백조 · 5 전갈 · 6 큰곰 · 7 안드로메다
 */
(function (root) {
  'use strict';

  const sagaData = {
    // 직업: 성좌별 선호와 기본 능력치, 도트 외형(color = 옷 색, gear = 들고 있는 장비)
    classes: [
      { id: 'hunter', name: '사냥꾼', hp: 90, atk: 14, def: 5, luck: 6, color: '#3f7d3a', gear: 'bow', likes: [0] },
      { id: 'bard', name: '음유시인', hp: 70, atk: 9, def: 4, luck: 12, color: '#3a6fd1', gear: 'lute', likes: [1] },
      { id: 'noble', name: '귀족', hp: 80, atk: 10, def: 6, luck: 10, color: '#b2283c', gear: 'rapier', likes: [2] },
      { id: 'rider', name: '기수', hp: 95, atk: 12, def: 7, luck: 7, color: '#d6d9e8', gear: 'lance', likes: [3] },
      { id: 'priest', name: '사제', hp: 75, atk: 8, def: 6, luck: 11, color: '#f2f2f2', gear: 'staff', likes: [4, 6] },
      { id: 'warrior', name: '전사', hp: 120, atk: 15, def: 9, luck: 4, color: '#8a4b20', gear: 'sword', likes: [5] },
      { id: 'scholar', name: '학자', hp: 65, atk: 8, def: 4, luck: 13, color: '#6b4fa8', gear: 'book', likes: [6] },
      { id: 'mage', name: '몽상가', hp: 60, atk: 16, def: 3, luck: 10, color: '#7a3fd0', gear: 'orb', likes: [7, 1] },
      { id: 'thief', name: '도적', hp: 70, atk: 13, def: 4, luck: 14, color: '#3a3a4a', gear: 'dagger', likes: [5, 0] },
      { id: 'knight', name: '기사', hp: 130, atk: 11, def: 12, luck: 5, color: '#9aa4b8', gear: 'shield', likes: [2, 3] }
    ],

    // 성격: 타락 속도(corrupt), 충성 변화(loyal), 배신 성향(betray)
    traits: [
      { id: 'brave', name: '용감한', corrupt: 0.8, loyal: 1.1, betray: 0.6, likes: [0, 5, 3] },
      { id: 'cunning', name: '교활한', corrupt: 1.2, loyal: 0.7, betray: 1.8, likes: [5, 2] },
      { id: 'pure', name: '순수한', corrupt: 0.5, loyal: 1.3, betray: 0.4, likes: [4, 1] },
      { id: 'ambitious', name: '야심찬', corrupt: 1.5, loyal: 0.8, betray: 1.4, likes: [2, 7] },
      { id: 'cold', name: '냉정한', corrupt: 1.0, loyal: 0.9, betray: 1.0, likes: [6, 4] },
      { id: 'gentle', name: '다정한', corrupt: 0.6, loyal: 1.2, betray: 0.5, likes: [1, 3] },
      { id: 'mad', name: '광기 어린', corrupt: 2.0, loyal: 0.8, betray: 1.2, likes: [7, 5] },
      { id: 'lonely', name: '고독한', corrupt: 1.1, loyal: 1.0, betray: 0.8, likes: [0, 6] }
    ],

    names: ['카엘', '세린', '이안', '루나', '다온', '하린', '레온', '유리엘', '아리아', '시온', '테오', '미르', '한결', '서하', '이든', '로아', '벨라', '카이로스', '니엔', '에단', '소아', '리안', '휘', '나린', '아젤', '도윤', '라헬', '세이', '우르', '키라', '모건', '아델', '비안', '헤일', '노아', '실라', '제논', '이로', '타리엘', '베인'],
    origins: ['변방 행성 아르케', '청람 행성 시엘', '붉은 사막 행성 카르', '얼음 행성 니브', '숲의 행성 엘드', '폐허 행성 오르무', '구름 행성 페론', '황혼 행성 루멘'],
    titles: ['별을 쫓는 자', '피의 맹세자', '은빛 날개', '잿빛 방랑자', '시련을 넘은 자', '밤의 노래', '왕관 없는 왕', '심연을 본 자', '불굴', '새벽의 칼날'],

    // 모험 지역과 몬스터 (도트 배경과 적 외형)
    regions: [
      { id: 'forest', name: '고요한 숲', sky: ['#0b1a2b', '#163a3f'], ground: '#1f3d22', dark: false },
      { id: 'desert', name: '붉은 사막', sky: ['#2a1630', '#7a3b2e'], ground: '#a8653a', dark: false },
      { id: 'ice', name: '얼어붙은 평원', sky: ['#0e1b33', '#3b5f8a'], ground: '#c8d8ec', dark: false },
      { id: 'ruins', name: '잊힌 폐허', sky: ['#151025', '#3a2a4a'], ground: '#4a4458', dark: false },
      { id: 'abyss', name: '심연의 틈새', sky: ['#05030c', '#2a0c3a'], ground: '#1a0f24', dark: true }
    ],
    monsters: [
      { id: 'slime', name: '별빛 슬라임', color: '#5fd17a', lvl: 0 },
      { id: 'bat', name: '그림자 박쥐', color: '#6a4a8a', lvl: 1 },
      { id: 'wolf', name: '성운 늑대', color: '#7d8aa8', lvl: 2 },
      { id: 'skeleton', name: '해골 병사', color: '#e6e0cc', lvl: 3 },
      { id: 'golem', name: '운석 골렘', color: '#8a6a4a', lvl: 5 },
      { id: 'wraith', name: '공허의 망령', color: '#b06cff', lvl: 6, dark: true }
    ],

    // 성좌 인격 (채널 메시지 말투)
    voices: [
      { name: '오리온', watch: '성좌 \'오리온\'이 활시위를 만지작거립니다.', like: '성좌 \'오리온\'이 짧게 고개를 끄덕입니다.', angry: '성좌 \'오리온\'이 화살촉을 갈기 시작합니다.' },
      { name: '리라', watch: '성좌 \'리라\'가 흥미롭다는 듯 현을 튕깁니다.', like: '성좌 \'리라\'가 이 장면을 노래로 남기고 싶어 합니다.', angry: '성좌 \'리라\'의 현이 불협화음을 냅니다.' },
      { name: '카시오페이아', watch: '성좌 \'카시오페이아\'가 거울 너머로 지켜봅니다.', like: '성좌 \'카시오페이아\'가 만족스럽게 미소 짓습니다.', angry: '성좌 \'카시오페이아\'가 왕좌의 팔걸이를 움켜쥡니다.' },
      { name: '페가수스', watch: '성좌 \'페가수스\'가 날개를 퍼덕이며 구경합니다.', like: '성좌 \'페가수스\'가 신나서 하늘을 한 바퀴 돕니다.', angry: '성좌 \'페가수스\'가 발굽으로 구름을 걷어찹니다.' },
      { name: '백조', watch: '성좌 \'백조\'가 조용히 호수 위에서 바라봅니다.', like: '성좌 \'백조\'가 깃털 하나를 내려 보냅니다.', angry: '성좌 \'백조\'의 호수가 얼어붙습니다.' },
      { name: '전갈', watch: '성좌 \'전갈\'이 꼬리를 세우고 지켜봅니다.', like: '성좌 \'전갈\'이 피 냄새에 즐거워합니다.', angry: '성좌 \'전갈\'이 독을 뚝뚝 흘립니다.' },
      { name: '큰곰', watch: '성좌 \'큰곰\'이 느긋하게 하품하며 지켜봅니다.', like: '성좌 \'큰곰\'이 오래된 지혜를 하나 흘립니다.', angry: '성좌 \'큰곰\'이 낮게 으르렁거립니다.' },
      { name: '안드로메다', watch: '성좌 \'안드로메다\'가 꿈결처럼 흐릿하게 바라봅니다.', like: '성좌 \'안드로메다\'가 사슬을 짤랑이며 웃습니다.', angry: '성좌 \'안드로메다\'의 사슬이 팽팽하게 당겨집니다.' }
    ],

    /* 운명 사건: 전조로 긴장도가 쌓이면 확률이 0.01%에서 최대 70%까지 오른다.
     * involve: 엮인 성좌 ('all' = 깨어난 모든 성좌) · need: 추가 조건 · effects: 결과 */
    fates: [
      { id: 'scorpion_hunt', icon: '🦂', name: '오리온의 마지막 사냥', involve: [0, 5, 4], desc: '전갈이 오래된 원한을 갚으려 합니다.',
        story: ['전갈의 독침이 사냥꾼의 발목을 노린다.', '하늘의 두 별이 다시 한 번 서로를 쫓는다.'], effects: [{ type: 'duel', a: 0, b: 5 }] },
      { id: 'concert', icon: '🎵', name: '별빛 연주회', involve: [1, 4, 7], desc: '리라의 현이 우주 전체를 울리려 합니다.',
        story: ['리라의 연주가 은하를 가로지른다.', '모든 별이 숨을 죽이고 귀를 기울인다.'], effects: [{ type: 'bless' }, { type: 'buff', mult: 3, minutes: 10 }] },
      { id: 'crown_war', icon: '👑', name: '왕관 쟁탈전', involve: [2, 7, 5], desc: '카시오페이아의 왕관을 노리는 자가 있습니다.',
        story: ['왕좌의 방에 피 묻은 장갑이 던져졌다.', '왕관을 둘러싼 음모가 수면 위로 드러난다.'], effects: [{ type: 'betray', to: 2 }, { type: 'duel' }] },
      { id: 'pegasus_rampage', icon: '🐎', name: '천마의 폭주', involve: [3], desc: '페가수스가 고삐를 끊으려 합니다.',
        story: ['천마가 하늘의 경계를 넘어 질주한다.', '사도는 날개 위에 매달려 공허를 가로지른다.'], effects: [{ type: 'trial', c: 3, power: 1.2 }] },
      { id: 'frozen_judgement', icon: '❄', name: '얼어붙은 호수의 심판', involve: [4, 6], desc: '백조가 더럽혀진 영혼을 심판하려 합니다.',
        story: ['호수가 거울처럼 얼어붙어 모든 죄를 비춘다.', '타락의 흔적이 얼음 위로 떠오른다.'], effects: [{ type: 'purify', amount: 60 }] },
      { id: 'blood_festival', icon: '🩸', name: '전갈의 피의 축제', involve: [5, 0, 6], desc: '사막의 투기장이 피를 부르고 있습니다.',
        story: ['붉은 달 아래 투기장의 문이 열린다.', '관중석의 별들이 함성을 지른다.'], effects: [{ type: 'arena' }] },
      { id: 'bear_revelation', icon: '🐻', name: '북극성의 계시', involve: [6], desc: '큰곰이 잊힌 진리를 기억해내려 합니다.',
        story: ['북극성이 한순간 태양보다 밝게 빛난다.', '오래된 지혜가 별빛을 타고 흘러내린다.'], effects: [{ type: 'ip', amount: 1 }, { type: 'matter', minutes: 20 }] },
      { id: 'chains_loosen', icon: '⛓', name: '안드로메다의 사슬이 풀리다', involve: [7, 2], desc: '바위에 묶인 공주의 사슬이 헐거워지고 있습니다.',
        story: ['천 년 묵은 사슬이 한 고리씩 끊어진다.', '어머니 카시오페이아의 오만이 다시 대가를 요구한다.'], effects: [{ type: 'corrupt', amount: 35 }, { type: 'buff', mult: 5, minutes: 8 }] },
      { id: 'rebellion', icon: '💀', name: '타락한 사도의 반란', involve: 'all', need: 'fallen', desc: '타락한 자가 별들에게 칼끝을 겨눕니다.',
        story: ['타락한 사도가 검은 별빛을 두르고 돌아왔다.', '그가 옛 주인의 이름을 비웃는다.'], effects: [{ type: 'rebellion' }] },
      { id: 'star_war', icon: '⚔', name: '성좌 대전', involve: 'all', minInvolved: 4, desc: '모든 별이 서로에게 등을 돌리려 합니다.',
        story: ['하늘이 둘로 갈라지고 별들이 전쟁을 선포한다.', '사도들이 각자의 깃발 아래 모여든다.'], effects: [{ type: 'arena' }, { type: 'buff', mult: 10, minutes: 15 }] },
      { id: 'star_wedding', icon: '💍', name: '별의 결혼식', involve: [1, 3], desc: '두 사도 사이에 묘한 기류가 흐릅니다.',
        story: ['리라의 노래가 페가수스의 날개 위에 내려앉는다.', '두 사도가 별빛 아래에서 손을 맞잡는다.'], effects: [{ type: 'wed' }, { type: 'buff', mult: 2, minutes: 20 }] },
      { id: 'abyss_whisper', icon: '🕳', name: '심연의 속삭임', involve: [7, 5], desc: '심연이 누군가의 이름을 부르고 있습니다.',
        story: ['어둠 속에서 달콤한 목소리가 들려온다.', '사도의 그림자가 주인보다 먼저 움직인다.'], effects: [{ type: 'corrupt', amount: 50, one: true }] },
      { id: 'god_trial', icon: '🔥', name: '신의 시험', involve: 'one', desc: '시험의 문이 열릴 준비를 하고 있습니다.',
        story: ['하늘에서 거대한 문이 내려온다.', '오직 한 명만이 그 문을 지날 수 있다.'], effects: [{ type: 'trial', power: 1.0 }] },
      { id: 'traitor_brand', icon: '🗡', name: '배신자의 낙인', involve: [2, 4], desc: '충성이 흔들리는 사도가 있습니다.',
        story: ['한 사도의 이마에 붉은 낙인이 떠오른다.', '그는 새 주인의 손을 잡았다.'], effects: [{ type: 'betray' }] },
      { id: 'meteor_night', icon: '🌠', name: '유성우의 밤', involve: [3, 4, 6], desc: '하늘이 별을 쏟아낼 준비를 합니다.',
        story: ['수천 개의 유성이 비처럼 쏟아진다.', '별들이 자신의 조각을 아낌없이 흩뿌린다.'], effects: [{ type: 'matter', minutes: 30 }, { type: 'bless' }] },
      { id: 'lost_princess', icon: '🗝', name: '잃어버린 왕녀', involve: [2, 7, 3], desc: '천마를 탄 영웅이 왕녀를 구하러 갑니다.',
        story: ['날개 달린 말이 바다 괴물의 그림자를 가른다.', '바위에 묶인 왕녀가 고개를 든다.'], effects: [{ type: 'trial', c: 3, power: 1.1 }, { type: 'bless' }] },
      { id: 'bear_cubs', icon: '🌟', name: '작은곰의 탄생', involve: [6], desc: '북쪽 하늘에 새 별이 태어나려 합니다.',
        story: ['큰곰의 품에서 작은 별이 눈을 뜬다.', '세계에 비범한 아이가 태어났다.'], effects: [{ type: 'hero' }, { type: 'matter', minutes: 10 }] },
      { id: 'eclipse', icon: '🌑', name: '별들의 일식', involve: 'all', minInvolved: 3, desc: '모든 별빛이 한순간 사라지려 합니다.',
        story: ['모든 성좌의 빛이 동시에 꺼진다.', '어둠 속에서 사도들은 스스로를 증명해야 한다.'], effects: [{ type: 'corrupt', amount: 20 }, { type: 'trial', power: 0.9 }] }
    ],

    /* 전조: 작은 사건(+3~8)과 큰 사건(+15~30)이 운명 사건의 긴장도를 쌓는다.
     * need: 'apostle' = 해당 성좌에 사도 필요, 'fallen' = 타락자 존재, 'corrupt' = 부패한 사도 존재, 'two' = 사도 2명 이상
     * c: 관련 성좌 (메시지 주체), fx: 작은 효과 */
    omens: [
      { c: 0, text: '오리온의 사냥터에서 피 묻은 화살이 발견되었다.', add: { scorpion_hunt: 6 } },
      { c: 5, text: '전갈이 오리온의 이름을 세 번 저주했다.', add: { scorpion_hunt: 12, blood_festival: 4 } },
      { c: 5, text: '전갈이 독을 벼리기 시작했다.', add: { scorpion_hunt: 8, abyss_whisper: 3 } },
      { c: 0, text: '오리온이 사냥감을 놓쳤다. 별들이 수군거린다.', add: { scorpion_hunt: 5, star_war: 2 } },
      { c: 5, text: '사막에 붉은 달이 떴다.', add: { blood_festival: 8 } },
      { c: 5, big: true, text: '투기장의 문 앞에 수백 개의 무기가 쌓였다.', add: { blood_festival: 22, star_war: 5 } },
      { c: 1, text: '리라의 현이 저절로 울렸다.', add: { concert: 8 } },
      { c: 1, text: '은하 저편에서 누군가 리라의 노래를 따라 부른다.', add: { concert: 6, star_wedding: 4 } },
      { c: 1, big: true, text: '리라가 천 년 만에 새 악보를 펼쳤다.', add: { concert: 25 } },
      { c: 4, text: '백조의 호수에 가느다란 금이 갔다.', add: { frozen_judgement: 8 } },
      { c: 4, text: '백조가 깃털 하나를 떨어뜨렸다.', add: { meteor_night: 5, frozen_judgement: 3 } },
      { c: 4, need: 'corrupt', text: '호수에 비친 사도의 그림자가 검게 물들었다.', add: { frozen_judgement: 14 } },
      { c: 2, text: '카시오페이아가 거울 앞에서 오래 머물렀다.', add: { crown_war: 6, chains_loosen: 5 } },
      { c: 2, text: '왕좌의 방에서 누군가 몰래 빠져나갔다.', add: { crown_war: 9, traitor_brand: 5 } },
      { c: 2, big: true, text: '카시오페이아의 왕관에서 보석 하나가 사라졌다.', add: { crown_war: 24, traitor_brand: 8 } },
      { c: 7, text: '안드로메다가 사슬을 만지작거린다.', add: { chains_loosen: 9, lost_princess: 4 } },
      { c: 7, text: '꿈속에서 바다 괴물의 울음소리가 들렸다.', add: { lost_princess: 8, chains_loosen: 4 } },
      { c: 7, big: true, text: '안드로메다의 사슬 고리 하나가 끊어졌다.', add: { chains_loosen: 28 } },
      { c: 7, text: '심연에서 누군가 사도의 이름을 불렀다.', add: { abyss_whisper: 9, eclipse: 2 } },
      { c: 3, text: '천마의 날개깃이 하나 빠졌다.', add: { pegasus_rampage: 7 } },
      { c: 3, text: '페가수스가 고삐를 물어뜯었다.', add: { pegasus_rampage: 10, lost_princess: 3 } },
      { c: 3, big: true, text: '페가수스가 하늘의 경계선까지 날아갔다 돌아왔다.', add: { pegasus_rampage: 26, meteor_night: 5 } },
      { c: 6, text: '북쪽 하늘이 유난히 밝다.', add: { bear_revelation: 8, meteor_night: 4 } },
      { c: 6, text: '큰곰이 오래된 별자리 지도를 꺼냈다.', add: { bear_revelation: 10 } },
      { c: 6, text: '북극성 곁에 아주 작은 빛이 깜빡인다.', add: { bear_cubs: 9 } },
      { c: 6, big: true, text: '큰곰의 동굴에서 따뜻한 빛이 새어 나온다.', add: { bear_cubs: 25 } },
      { c: -1, text: '유성 하나가 길을 잃고 헤맨다.', add: { meteor_night: 7 } },
      { c: -1, text: '성좌들이 서로를 곁눈질한다.', add: { star_war: 4, eclipse: 2 } },
      { c: -1, text: '별들의 장부가 어긋났다.', add: { star_war: 6, crown_war: 3 } },
      { c: -1, big: true, text: '성좌 하나가 다른 성좌의 사도를 비웃었다.', add: { star_war: 18, blood_festival: 6 } },
      { c: -1, text: '하늘의 빛이 한순간 깜빡였다.', add: { eclipse: 6 } },
      { c: -1, big: true, text: '모든 별의 그림자가 같은 방향을 가리킨다.', add: { eclipse: 22, star_war: 6 } },
      { c: -1, text: '시험의 문이 멀리서 흔들린다.', add: { god_trial: 8 } },
      { c: -1, big: true, text: '시험의 문 앞에 촛불이 켜졌다.', add: { god_trial: 22 } },
      { c: -1, need: 'two', text: '두 사도가 같은 여관에 묵었다.', add: { star_wedding: 9, blood_festival: 3 } },
      { c: -1, need: 'two', text: '두 사도가 길에서 마주쳐 칼자루에 손을 얹었다.', add: { blood_festival: 9, scorpion_hunt: 3 } },
      { c: -1, need: 'corrupt', fx: { corrupt: 8 }, text: '{A}의 눈빛이 탁해졌다.', add: { abyss_whisper: 8, frozen_judgement: 6 } },
      { c: -1, need: 'corrupt', fx: { corrupt: 12 }, big: true, text: '{A}가 밤마다 낯선 목소리와 대화한다.', add: { abyss_whisper: 18 } },
      { c: -1, need: 'fallen', text: '타락한 {F}의 발자국이 새로 발견되었다.', add: { rebellion: 10 } },
      { c: -1, need: 'fallen', big: true, text: '타락한 {F}의 깃발 아래 그림자들이 모여든다.', add: { rebellion: 26 } },
      { c: -1, need: 'fallen', text: '타락한 {F}가 옛 주인의 성소를 바라본다.', add: { rebellion: 12, frozen_judgement: 5 } },
      { c: -1, need: 'apostle', fx: { loyalty: -12 }, text: '{A}가 후원이 부족하다고 투덜거렸다.', add: { traitor_brand: 8 } },
      { c: -1, need: 'apostle', fx: { loyalty: -6, corrupt: 5 }, text: '{A}가 다른 성좌의 속삭임에 귀를 기울였다.', add: { traitor_brand: 10, crown_war: 3 } },
      { c: -1, need: 'apostle', fx: { loyalty: 8 }, text: '{A}가 성소를 향해 무릎을 꿇었다.', add: { god_trial: 4 } },
      { c: -1, need: 'apostle', fx: { xp: 40 }, text: '{A}가 고대 유적에서 비문을 해독했다.', add: { bear_revelation: 5, god_trial: 3 } },
      { c: -1, need: 'apostle', fx: { corrupt: 6 }, text: '{A}가 금지된 서고에 몰래 들어갔다.', add: { abyss_whisper: 7, bear_revelation: 4 } },
      { c: -1, need: 'apostle', text: '{A}가 마을을 구하고 영웅으로 칭송받았다.', add: { god_trial: 6, concert: 3 } },
      { c: -1, need: 'apostle', fx: { hp: -30 }, text: '{A}가 매복에 걸려 큰 부상을 입었다.', add: { blood_festival: 4, eclipse: 2 } },
      { c: -1, need: 'apostle', text: '{A}가 별을 올려다보며 고향을 그리워한다.', add: { meteor_night: 4, star_wedding: 2 } },
      { c: -1, need: 'apostle', fx: { corrupt: 10 }, big: true, text: '{A}가 피 묻은 계약서에 서명했다.', add: { abyss_whisper: 15, traitor_brand: 8 } }
    ]
  };

  const CD = root.CD = root.CD || {};
  CD.sagaData = sagaData;
  if (typeof module === 'object' && module.exports) module.exports = sagaData;
})(typeof globalThis !== 'undefined' ? globalThis : this);
