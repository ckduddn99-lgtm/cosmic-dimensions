/* 초공간 차원 붕괴 — 정적 게임 데이터 (밸런스 수치는 모두 여기서 조정) */
(function (root) {
  'use strict';

  const data = {
    // 차원: 첫 구매가 10^costExp, 10개 묶음마다 10^stepExp 배로 비싸진다
    dims: [
      { roman: 'I', name: '물질 차원', costExp: 1, stepExp: 3 },
      { roman: 'II', name: '에너지 차원', costExp: 2, stepExp: 4 },
      { roman: 'III', name: '중력 차원', costExp: 4, stepExp: 5 },
      { roman: 'IV', name: '시간 차원', costExp: 6, stepExp: 6 },
      { roman: 'V', name: '공간 차원', costExp: 9, stepExp: 8 },
      { roman: 'VI', name: '정보 차원', costExp: 13, stepExp: 10 },
      { roman: 'VII', name: '가능성 차원', costExp: 18, stepExp: 12 },
      { roman: 'VIII', name: '초월 차원', costExp: 24, stepExp: 15 }
    ],

    // 인피니티 업그레이드 (앞 4개는 이전 세이브와 순서가 같아야 한다)
    upgrades: [
      { icon: '⚡', name: '시공간 압축', desc: '차원 부스트 배율이 ×2에서 ×2.5로 증가합니다.', cost: 1 },
      { icon: '🌌', name: '은하 가속', desc: '반물질 은하의 틱스피드 강화 효과가 1.5배가 됩니다.', cost: 1 },
      { icon: '💠', name: '무한 생성기', desc: '제1차원의 생산량이 영구적으로 ×100 증가합니다.', cost: 2 },
      { icon: '♾', name: '초공간 시너지', desc: '빅 크런치 1회마다 모든 차원 생산량 +100%.', cost: 3 },
      { icon: '💰', name: '출발 자금', desc: '모든 리셋 후 반물질 100,000으로 시작합니다.', cost: 2 },
      { icon: '🤖', name: '자동 구매기 α', desc: '제1~4차원을 자동으로 최대 구매합니다.', cost: 2, auto: 'low' },
      { icon: '🛰', name: '자동 구매기 β', desc: '제5~8차원과 틱스피드를 자동으로 최대 구매합니다.', cost: 3, auto: 'high' },
      { icon: '🔁', name: '자동 리셋', desc: '차원 교체·부스트·반물질 은하를 조건 충족 시 자동 실행합니다.', cost: 5, auto: 'reset' },
      { icon: '✨', name: '이중 붕괴', desc: '빅 크런치로 얻는 IP가 2배가 됩니다.', cost: 5 },
      { icon: '☄', name: '자동 붕괴', desc: '∞ 도달 시 자동으로 빅 크런치를 실행합니다.', cost: 8, auto: 'crunch' }
    ],

    // 성좌: per = 후원 레벨당 효과
    constellations: [
      { name: '오리온', title: '사냥꾼의 별', desc: '모든 차원 생산량 +15% / Lv', per: 0.15 },
      { name: '리라', title: '거문고의 별', desc: '틱스피드 효율 +8% / Lv', per: 0.08 },
      { name: '카시오페이아', title: '여왕의 별', desc: '마스터리 경험치 +20% / Lv', per: 0.20 },
      { name: '페가수스', title: '천마의 별', desc: '과충전 지속시간 +20% / Lv', per: 0.20 },
      { name: '백조', title: '고니의 별', desc: '오프라인 생산량 +15% / Lv', per: 0.15 },
      { name: '전갈', title: '전사의 별', desc: '도전 보상 +25% / Lv', per: 0.25 },
      { name: '큰곰', title: '북극성의 별', desc: '업적 보너스 +10% / Lv', per: 0.10 },
      { name: '안드로메다', title: '은하의 별', desc: '성좌 후원 비용 -5% / Lv', per: 0.05 }
    ],

    apostles: [
      { name: '오리온', title: '침묵의 사냥꾼', personality: '과묵하고 직설적이다. 말이 짧다.' },
      { name: '리라', title: '별빛 음유시인', personality: '낭만적이고 노래하듯 말한다.' },
      { name: '카시오페이아', title: '자부심 강한 여왕', personality: '고귀하고 당당하게 말한다.' },
      { name: '페가수스', title: '자유로운 천마', personality: '쾌활하고 빠르게 말한다.' },
      { name: '백조', title: '순백의 감시자', personality: '차분하고 조용하게 말한다.' },
      { name: '전갈', title: '불굴의 전사', personality: '호전적이고 힘차게 말한다.' },
      { name: '큰곰', title: '북극성의 인도자', personality: '현명하고 느긋하게 말한다.' },
      { name: '안드로메다', title: '은하의 공주', personality: '신비롭고 몽환적으로 말한다.' }
    ],

    skills: [
      { name: '축복', desc: '모든 차원 생산 +5% / Lv' },
      { name: '수호', desc: '오프라인 생산 +10% / Lv' },
      { name: '계시', desc: '주기적으로 반물질을 발견합니다' }
    ],

    dialogue: {
      discovery: [
        '{name}: {place}에서 {item}을(를) 찾아냈다.',
        '{name}: {place}에 {item}이(가) 있었다. 가져왔다.',
        '{name}: 우연히 {place}에서 {item}을(를) 발견했다.',
        '{name}의 계시 — {place}, 그곳에 {item}이(가) 잠들어 있었다.',
        '{name}: {item}… {place}에서 주웠다.'
      ],
      levelup: [
        '{name}: 강해졌다. 다음은 더 큰 것을 노린다.',
        '{name}의 힘이 자라났다. {skill}의 경지가 깊어졌다.',
        '{name}: 이 정도면 아직 시작이다.',
        '{name}이(가) 한 단계 올랐다. 눈빛이 달라졌다.',
        '{name}: 후원이 헛되지 않았다.'
      ],
      greeting: [
        '{name}: 깨어났다. 명령을 내려라.',
        '{name}: 별들이 속삭인다. 들리나?',
        '{name}: 오늘도 우주를 누비겠다.',
        '{name}이(가) 당신을 주시하고 있다.',
        '{name}: 준비됐다. 언제든 가겠다.'
      ]
    },
    places: ['붉은 성운', '고요한 암흑대', '뒤틀린 시공간', '잊힌 은하단', '푸른 초신성 잔해', '거대한 블랙홀 주변', '성간 먼지 구름', '얼어붙은 소행성대', '빛의 장벽 너머', '심연의 틈새', '황금빛 퀘이사', '침묵의 보이드', '수정 성운', '시간의 강가', '어둠의 성단'],
    items: ['시간의 파편', '차원의 씨앗', '별의 눈물', '공간의 매듭', '인피니티 잔향', '중력의 심장', '빛의 화석', '우주의 기억', '차원석', '성운의 정수', '시간의 모래', '별가루 결정', '공허의 조각', '은하의 눈동자', '특이점 파편'],

    // 연구: currency 'am'은 비용 = 10^(costExp + stepExp × Lv), 'ip'는 비용 = cost × 2^Lv
    // 연구 트리: req = 먼저 Lv.1 이상이어야 하는 연구, x/y = 트리 배치(%)
    research: [
      { icon: '◈', name: '차원 공명', desc: '모든 차원 생산 +20% / Lv', per: 0.2, unit: '%', currency: 'am', costExp: 6, stepExp: 6, req: -1, x: 50, y: 10 },
      { icon: '⏱', name: '시간 압축', desc: '틱스피드 +10% / Lv', per: 0.1, unit: '%', currency: 'am', costExp: 8, stepExp: 8, req: 0, x: 22, y: 38 },
      { icon: '💠', name: '물질 정제', desc: '제1차원 생산 +50% / Lv', per: 0.5, unit: '%', currency: 'am', costExp: 4, stepExp: 5, req: 0, x: 78, y: 38 },
      { icon: '🌌', name: '은하 씨앗', desc: '반물질 은하 요구량 -5% / Lv', per: 0.05, unit: '%', currency: 'am', costExp: 40, stepExp: 20, req: 4, x: 50, y: 90 },
      { icon: '⚡', name: '초공간 도약', desc: '차원 부스트 배율 +0.1 / Lv', per: 0.1, unit: 'x', currency: 'am', costExp: 25, stepExp: 15, req: 1, x: 22, y: 66 },
      { icon: '✴', name: '특이점 이론', desc: '빅 크런치 IP +1 / Lv', per: 1, unit: 'n', currency: 'ip', cost: 5, req: -1, x: 50, y: 12 },
      { icon: '🌙', name: '평행 우주', desc: '오프라인 생산 +50% / Lv', per: 0.5, unit: '%', currency: 'ip', cost: 3, req: 5, x: 22, y: 50 },
      { icon: '✦', name: '차원 융합', desc: '마스터리 경험치 +30% / Lv', per: 0.3, unit: '%', currency: 'am', costExp: 12, stepExp: 10, req: 2, x: 78, y: 66 },
      { icon: '🔥', name: '암흑 물질', desc: '과충전 배율 +0.1 / Lv (×2 → ×2.5)', per: 0.1, unit: 'x', currency: 'ip', cost: 4, req: 5, x: 78, y: 50 },
      { icon: '🏆', name: '무한 회로', desc: '업적 보너스 +10% / Lv', per: 0.1, unit: '%', currency: 'ip', cost: 3, req: 6, x: 50, y: 88 }
    ],
    researchMax: 5,

    galaxyTypes: [
      { id: 'spiral', name: '나선 은하' }, { id: 'elliptical', name: '타원 은하' },
      { id: 'irregular', name: '불규칙 은하' }, { id: 'ring', name: '고리 은하' }
    ],
    galaxyNames: ['NGC-7843', 'K-91', 'IN-776', 'A17-β', 'ZQ-114', 'PX-9', 'HL-203', 'VX-88', 'OR-15', 'TY-42'],

    // 특수 현상 (플레이 중에만 발생)
    events: [
      { id: 'storm', icon: '🌪', name: '차원 폭풍', desc: '모든 차원 생산 ×3', seconds: 180 },
      { id: 'warp', icon: '⏳', name: '시간 왜곡', desc: '틱스피드 ×2', seconds: 180 },
      { id: 'flood', icon: '🌊', name: '물질 홍수', desc: '반물질 획득 ×4', seconds: 120 }
    ],

    // 도전 (첫 빅 크런치 후 해금): 우주를 처음부터 다시 시작해 goalExp(10^goalExp 반물질)에 도달하면 완료. 종료 시 원래 우주로 복귀한다.
    challenges: [
      { name: '속박된 시간', debuff: '틱스피드 효과가 절반이 됩니다.', goalExp: 30, reward: 0.10 },
      { name: '무거운 차원', debuff: '차원 구매 비용이 10배가 됩니다.', goalExp: 35, reward: 0.15 },
      { name: '봉인된 차원', debuff: '차원 교체를 할 수 없습니다. (제1~4차원만 사용)', goalExp: 25, reward: 0.20 },
      { name: '고립된 우주', debuff: '차원 부스트를 할 수 없습니다.', goalExp: 40, reward: 0.25 },
      { name: '시간 정지', debuff: '틱스피드를 구매할 수 없습니다.', goalExp: 20, reward: 0.30 },
      { name: '공명 붕괴', debuff: '10개 묶음 보너스가 ×2에서 ×1.5로 감소합니다.', goalExp: 35, reward: 0.50 }
    ],

    // 일일 접속 보상: 생산량 기준 분 단위 보상 (마지막 날은 IP 추가)
    daily: [
      { minutes: 5 }, { minutes: 10 }, { minutes: 15 }, { minutes: 20 }, { minutes: 30 }, { minutes: 45 }, { minutes: 60, ip: 1 }
    ]
  };

  const CD = root.CD = root.CD || {};
  CD.data = data;
  if (typeof module === 'object' && module.exports) module.exports = data;
})(typeof globalThis !== 'undefined' ? globalThis : this);
