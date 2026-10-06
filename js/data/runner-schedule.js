// Calendar dates and times are explicitly KST; no server, timers or generated events.
const event = (start, end, title, startTime = '00:00:00', endTime = '23:59:59') => ({
  start: `2026-10-${String(start).padStart(2, '0')}T${startTime}+09:00`,
  end: `2026-10-${String(end).padStart(2, '0')}T${endTime}+09:00`, title
});
export const RUNNER_SCHEDULE = [
  event(2,2,'개장'), event(2,8,'오리엔테이션'), event(3,7,'장기자랑'),
  event(5,5,'1주차 조별과제 공개 · 조 편성'), event(6,8,'1주차 조별과제'),
  event(9,9,'1주차 주간평가 공개'), event(9,10,'상대평가'), event(11,11,'상대평가 결과 발표'),
  event(12,12,'2주차 조별과제 공개 · 조 편성'), event(13,15,'2주차 조별과제'), event(13,15,'체육대회'),
  event(16,16,'2주차 주간평가 공개'), event(16,16,'?'), event(17,18,'신입 회식'),
  event(19,19,'3주차 조별과제 공개 · 조 편성'), event(20,22,'3주차 조별과제'),
  event(23,23,'3주차 주간평가 공개'), event(25,27,'최종면접 질문지 공개','20:00:00'),
  event(28,30,'최종면접'), event(31,31,'엔딩')
];
export function eventsForDate(date) {
  return RUNNER_SCHEDULE.filter(item => item.start.slice(0,10) <= date && item.end.slice(0,10) >= date);
}
