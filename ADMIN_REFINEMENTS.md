# 관리자 화면 보완 — 스탯 정의 / 행동 / 스킬

## 적용 방법

홈페이지 원본 폴더:
`C:/Users/broth/Documents/Codex/2026-08-23/https-naru-pub-https-naru-pub-4/outputs/pinfu-company`

1. 기존 `sql/character-admin.sql`이 설치된 같은 Supabase 프로젝트를 사용한다.
2. 봇을 중지하고 관리자 편집을 잠시 멈춘 뒤 이번 버전의 다음 SQL을 실행한다.
   - `sql/skill-admin.sql`: 기존 스킬 RPC 갱신. 돈 효과를 새로 만들거나 변경할 수 없도록 보호.
   - `sql/action-admin.sql`: 기존 행동 RPC 갱신. requirement의 효과 입력을 거부하고 기존 값은 보존.
   - `sql/stat-admin.sql`: 스탯 정의 관리 RPC 추가.
3. 수정된 홈페이지 파일을 기존 Naru 방식으로 반영하고 브라우저를 새로고침한다.
4. 관리자 메뉴 → **스탯 정의 관리** (`#/admin/stats`)에서 목록·등록·수정을 사용한다.
5. 새 활성 스탯은 기존 활성 캐릭터에게 DB 트리거로 자동 등록된다. 비활성 상태였다가 나중에 활성화하는 경우는 아래 주의사항을 확인한다.

SQL은 관리 함수를 설치/갱신할 뿐 새 테이블·컬럼·트리거를 만들지 않는다. 운영 DB에 이번 SQL을 적용하거나 홈페이지를 배포하지 않았다. 이전 SQL/화면과 새 버전을 혼용하면 보호 검증 때문에 저장이 거절될 수 있다.

## 스탯 정의 화면

- 목록: 표시 이름, 내부 key, 설명, 초기값, 활성 여부. 이름/key 검색, 활성 필터, 25개 단위 페이지.
- 생성: stat_definitions에 실제 행 생성. ID는 DB에서 반환받는다.
- 수정: display_name, description, default_value, enabled. 기존 stat_key는 조회 전용이며 서버에서도 변경을 거부한다.
- 저장 전 변경사항 확인, 수동 저장, 취소, 충돌 감지, 봇 중지 확인.
- 캐릭터별 character_stats.value는 이 화면의 저장 함수가 수정하지 않는다. 초기값 변경은 기존 수치 일괄 초기화가 아니다.
- 기존 스탯 정의·참조를 삭제하지 않는다. 비활성화를 사용한다.
- 이름을 하드코딩하지 않고 현재 정의를 캐릭터·행동·스킬 화면에서 다시 조회한다.
- 엔진은 이미 참조된 stat_id 효과를 실행할 때 stat_definitions.enabled를 따로 검사하지 않는다. 스탯 비활성화만으로 기존 행동 효과가 중지된다고 해석하면 안 된다.

## 운영 DB 확인 결과 — 두 방향 모두 확인 완료

2026-08-31 사용자가 운영 Supabase SQL Editor에서 실행한 감사 결과를 제공했다. 트리거 이름뿐 아니라 pg_get_triggerdef와 pg_get_functiondef의 실제 정의를 확인했다.

| 구분 | 트리거 | 실제 동작 |
| --- | --- | --- |
| A | trg_initialize_character_stats | characters INSERT 후, enabled=true인 stat_definitions의 default_value로 새 캐릭터의 수치를 생성 |
| B | trg_initialize_new_stat_for_characters | stat_definitions INSERT 후, 새 스탯이 enabled=true일 때 기존 active=true 캐릭터의 수치를 new.default_value로 생성 |

- 두 트리거의 tgenabled는 O(일반 실행 활성)이며 AFTER INSERT / FOR EACH ROW다.
- A는 신규 캐릭터의 active 여부를 제한하지 않는다. 비활성 캐릭터로 새로 등록해도 당시 활성 스탯은 초기화된다.
- 두 함수 모두 SECURITY DEFINER이며 public.character_stats를 사용한다.
- 두 함수 모두 ON CONFLICT (character_id, stat_id) DO NOTHING을 사용한다. 해당 복합 UNIQUE 인덱스도 존재한다. 기존 값은 덮어쓰지 않는다.
- characters.id, stat_definitions.id, character_stats.id는 bigint identity다. 기존 관리자 ID 처리와 일치한다.
- 감사 시점의 활성 캐릭터 × 활성 스탯 누락 쌍은 **0개**다.
- requirements_with_ignored_effects는 빈 배열이다. 정리할 무의미한 requirement 효과는 발견되지 않았다.

**추가 트리거 SQL이나 현재 데이터 backfill은 필요하지 않다. 기존 DB 트리거를 그대로 사용한다.**

### INSERT와 활성 전환은 다르다

트리거는 UPDATE에는 실행되지 않는다.
- 비활성으로 만든 스탯을 나중에 활성화해도 기존 캐릭터에게 수치가 자동 추가되지 않는다.
- 새 활성 스탯을 만들 당시 비활성이었던 캐릭터를 재활성화해도 해당 수치가 자동 보충되지 않는다.
- default_value를 수정해도 기존 character_stats.value는 바뀌지 않는다. 이후 신규 캐릭터 초기화에는 바뀐 초기값이 사용된다.
- 따라서 이 운영 흐름에서는 캐릭터 관리의 미등록 스탯 항목을 확인하고 필요한 값을 명시적으로 등록한다. 활성 전환용 별도 자동 보충은 이번에 추가하지 않았다.

관리자 화면의 ‘미확인’ 안내를 위 실제 조건으로 정정했다. 운영 트리거/함수/저장 SQL은 변경하지 않았다. 제공된 두 함수와 트리거를 테스트 전용 fixture로 옮겨 로컬 PostgreSQL에서 A/B, 필터, 초기값, 활성 전환, 충돌 시 기존 값 보존을 검증했다. 운영 DB에 테스트 행을 만들지는 않았다.

`sql/stat-trigger-audit.sql`은 나중에 구성이 바뀌었을 때 재확인할 수 있도록 읽기 전용으로 유지한다. `tests/fixtures/verified-stat-triggers.sql`은 테스트용 복사본이므로 운영 DB에서 실행하지 않는다.

## 기존 돈 효과 보존

- 신규 선택지는 엔진의 비금전 modifier 13종만 제공한다.
- 기존 돈 modifier 카드는 렌더링하지 않고 ‘편집 범위 밖인 기존 효과 N개 보존’ 안내만 표시한다.
- 편집 요청에서 그 행들을 제외해도 서버는 삭제하지 않는다.
- 서버는 기존 돈 modifier ID를 다른 유형으로 바꾸려는 요청도 거부한다.
- 해당 행의 ID/value/대상/기간/활성/params와 사용 기록을 그대로 유지한다.
- 공유 skills.enabled를 변경하면 보존된 효과도 스킬 전체 활성 여부의 영향을 받는다.
- Python 엔진·DB 컬럼·기존 돈 기능은 삭제하지 않았다.

## requirement와 다이스

requirement 카드에서는 조건과 규칙 식별·활성·우선순위만 편집한다. 컨디션/스탯 변화 입력은 렌더링하지 않으며 저장 요청에도 포함하지 않는다. 서버는 requirement에 condition_delta 또는 stats가 전달되면 거부한다.

새 requirement는 필수 숫자 컬럼의 중립값 0만 저장하고 stat effect 행을 생성하지 않는다. 기존 requirement의 효과 값·연결 행은 삭제하거나 덮어쓰지 않는다. 존재하면 화면에서 보존 안내를 표시한다. 일반 효과를 requirement로 바꿔도 기존 효과 행은 보존되고 엔진에서 사용되지 않는다.

dice_enabled=false면 다이스 설정 영역이 hidden 상태이며 입력도 비활성화한다. true로 바꾸면 표시한다. 저장 값 정책은 기존 commandDefinition/RPC 정책 그대로다.

## modifier별 표시 필드

모든 편집 가능 효과에는 활성, 우선순위, 대상 명령, period/max_uses를 제공한다. 대상 명령과 기간 제한은 Python load_skill_context가 공통 적용한다. 따라서 daily_action_bonus도 특정 명령 전용 설정이 가능하다.

| modifier | value | 대상 스탯 |
| --- | --- | --- |
| daily_action_bonus | 표시: 정수 보너스 | 숨김 |
| condition_delta_bonus | 표시: 변화량 | 숨김 |
| condition_cost_multiplier | 표시: 소모 배율 | 숨김 |
| condition_recovery_multiplier | 표시: 회복 배율 | 숨김 |
| stat_delta_bonus | 표시: 변화량 | 표시 |
| stat_gain_multiplier | 표시: 증가 배율 | 표시 |
| stat_loss_multiplier | 표시: 감소 배율 | 표시 |
| dice_threshold_delta | 표시: 성공 기준 보정 | 숨김 |
| dice_result_bonus | 표시: 판정값 보정 | 숨김 |
| dice_reroll | 표시: 실패 시 최대 추가 재굴림 수 | 숨김 |
| repeat_penalty_delay | 표시: 지연 횟수 | 숨김 |
| block_negative_stat | 숨김: 엔진 미사용 | 표시 |
| block_condition_loss | 숨김: 엔진 미사용 | 숨김 |

숨기는 필드는 단순 disabled가 아니라 해당 입력을 렌더링하지 않는다. 유형을 변경하면 입력 영역을 다시 구성한다. 기존 방어 효과의 미사용 value는 UI에서 바꾸지 않고 보존한다. 기간/한도는 modifier별이며 서울 기준 일일·월요일 시작 주간 계산을 유지한다. params 자유 편집기는 추가하지 않았다.

## 추가/수정 파일

추가:
- js/pages/stats-admin.js, js/stat-admin-model.js, js/stats.js: 스탯 정의 화면·검증·연결.
- sql/stat-admin.sql: 스탯 정의 조회/저장.
- sql/stat-trigger-audit.sql: 운영 트리거 읽기 전용 감사.
- tests/admin-refinements.test.mjs: 신규 회귀 검증.
- tests/verified-stat-triggers.test.mjs, tests/fixtures/verified-stat-triggers.sql: 제공된 실제 트리거 정의의 로컬 회귀 검증.
- ADMIN_REFINEMENTS.md: 이 안내.

수정:
- js/skill-admin-model.js, js/pages/skills-admin.js, sql/skill-admin.sql: 13종 선택지와 기존 돈 효과 보호, 유형별 입력.
- js/action-admin-model.js, js/pages/actions-admin.js, sql/action-admin.sql: requirement 조건 전용 저장, 효과 보존, 다이스 숨김.
- js/pages/characters-admin.js, script.js, styles.css: 스탯 관리 경로·링크·스타일·미저장 보호.
- tests/fixtures/character-schema.sql: 실제 스탯 컬럼을 반영한 테스트 전용 스키마.
- tests/skill-admin.test.mjs, tests/action-admin.test.mjs: 기존 검증 케이스를 새 정책에 맞게 갱신.
- README.md, SKILL_ADMIN.md, ACTION_ADMIN.md: 현재 사용법 반영.

기존 js/organization-view.js의 사용자 변경은 건드리지 않았다. Python 엔진은 수정하지 않았다.

## 테스트 결과

기존 **45개 + 관리자 보완 19개 + 실제 트리거 대조 8개 = 총 72개 통과**, 실패·건너뜀 0개.

추가 검증: 동적 스탯 목록/신규/수정, key 변경 차단, 캐릭터 수치 미변경, 권한·충돌·중복·잘못된 입력, 기존 트리거 존중, 돈 효과 4종 신규 제외와 원본 보존, 13종 필드 구성, requirement 효과 미생성·기존 효과 보존·규칙 종류 전환, 다이스 숨김/표시, 감사 SQL 읽기 전용 실행.

기존 엔진 대조 테스트도 통과했다. 실제 Python을 사용하되 저장소는 가짜로 교체하고, DB 테스트는 격리된 로컬 PostgreSQL에서 실행했다. 운영 데이터 변경·봇 게시글 작성·로그인 브라우저 클릭 테스트는 하지 않았다.

```powershell
node --test --test-reporter=spec tests/character-admin.test.mjs tests/skill-admin.test.mjs tests/skill-command.test.mjs tests/action-admin.test.mjs tests/admin-refinements.test.mjs tests/verified-stat-triggers.test.mjs
```

테스트에는 기존 PGLITE_MODULE, CORE_BOT_DIR, CORE_BOT_PYTHON 환경변수가 필요하다. tests/fixtures/character-schema.sql은 운영 DB에 실행하지 않는다.
