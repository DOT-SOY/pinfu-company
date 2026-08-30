# 캐릭터 관리 화면

기존 Naru 사이트의 관리자 메뉴에 **캐릭터 관리**를 추가했다. 경로는 `#/admin/characters`다. 새 사이트나 별도 캐릭터 저장소로 이전하지 않는다.

새 스킬 정의를 만드는 기능은 별도 **스킬 관리**(`#/admin/skills`)에 추가했다. `SKILL_ADMIN.md`와 `sql/skill-admin.sql`을 참고한다. 캐릭터 관리 화면은 기존 스킬의 부여·회수만 담당한다.

## 최초 설치

1. 홈페이지와 봇이 사용하는 같은 Supabase 프로젝트의 SQL Editor에서 **sql/character-admin.sql**을 실행한다.
2. 수정된 정적 사이트 파일을 기존 Naru 배포 방식으로 반영한다.
3. 기존 `profiles.role = 'admin'` 계정으로 로그인하여 **캐릭터 관리** 메뉴를 연다.

SQL 파일은 관리용 RPC 함수만 추가한다. 새 테이블/컬럼, 관리자용 복제 스탯, 역할 부여, 기존 RLS 변경, 기록 삭제를 하지 않는다. 이번 작업에서는 운영 DB에 이 SQL을 자동 실행하지 않았다. 함수가 설치되지 않으면 화면에 설치 안내가 나오며, 브라우저에서 직접 테이블을 수정하는 우회 경로는 없다.

로컬 확인은 기존 방식대로 해당 폴더에서 `python -m http.server 8000`을 실행하고 `http://localhost:8000/#/admin/characters`를 연다. ES module과 로그인 기능을 사용하므로 file://로 index.html을 직접 열지 않는다. 홈페이지에 등록된 인증 설정과 관리자 계정이 필요하다.

**tests/fixtures/character-schema.sql은 가짜 데이터가 들어 있는 격리 테스트 전용 파일이다. Supabase에 실행하지 않는다.** 운영 설치에 쓰는 파일은 `sql/character-admin.sql` 하나뿐이다.

## 화면과 저장 범위

- 왼쪽: 이름 검색, 활성/비활성 필터, 25명 단위 페이지, 캐릭터 선택.
- 오른쪽 기본 정보: 이름, 읽기 전용 commu 프로필 ID, 컨디션, 기본 일일 행동횟수, 활성 상태.
- 모든 스탯: stat_definitions를 기준으로 character_stats를 연결해 동적으로 표시. 정의 이름은 수정하지 않는다. 음수 값도 가능하다.
- 새 스탯 정의에 캐릭터별 행이 아직 없으면 '미등록'으로 표시한다. 값을 명시적으로 입력해 저장할 때만 character_stats에 해당 관계를 추가한다. 스탯 정의 자체는 생성/수정하지 않는다.
- 오늘 행동: 사용/최대/남은 횟수는 조회 전용이며 서버에서 계산한다. 화면을 연 시점의 값이므로 최신값은 새로고침한다.
- 보유 스킬: 이름, 설명, 효과별 조건·사용량·활성 여부.
- 스킬 부여: enabled=true인 기존 skills만 검색한다. 현재 보유한 스킬은 후보에서 제외한다.
- 스킬 회수: 해당 character_skills.active만 false로 바꾼다. 스킬 정의/다른 캐릭터/사용 기록은 건드리지 않는다. 재부여는 기존 관계를 재활성화하며 과거 사용량을 초기화하지 않는다.

money 값은 조회 결과에도 포함하지 않고 입력/표시/수정하지 않는다. 금액 관련 modifier는 수치 요약을 숨긴다. 스킬의 기존 설명 텍스트 자체는 공유 정의의 설명을 그대로 표시한다. 최근 행동 내역, action_logs 목록, action_stat_changes 목록, 기록 수정/삭제, 스킬 정의 편집, 스탯 정의 편집은 없다.

기본 수치·스탯은 입력만으로 저장하지 않는다. 변경 전후 미리보기 → 확인 → 저장 순서다. 스킬 부여/회수는 각각 별도 확인 후 즉시 반영된다. 수치 편집이 미저장 상태라면 먼저 저장하거나 취소해야 스킬을 변경할 수 있다.

## 봇 계산과 일치하는 부분

- action_logs는 `action_consumed=true`와 character_id로 **개수만** 집계한다.
- 날짜는 서버 시각을 Asia/Seoul로 변환한 오늘 00:00 이상, 다음날 00:00 미만이다.
- 주간 제한은 Asia/Seoul 월요일 00:00 이상, 다음 월요일 00:00 미만이다.
- modifier 사용량은 skill_usages의 character_id + skill_modifier_id로 집계한다. 스킬 전체 합계가 아니다.
- period=null/always의 제한형 효과는 전체 누적을 계산한다. max_uses=null은 사용 한도가 없다.
- daily_action_bonus는 보유 관계 active, skills.enabled, modifier.enabled, 미소진 사용 한도 조건을 적용한다.
- 오늘 최대 횟수는 Python status_engine처럼 command_id=None 기준의 일반 보너스만 합산한다. 특정 명령 전용 보너스는 이 일반 상태 수치에서 제외된다. 최대는 max(0, base + bonus), 남은 횟수는 max(0, 최대 - 사용)다.
- 보유 스킬 요약의 '사용 가능'은 해당 효과의 조건을 충족할 때 적용 가능하다는 뜻이다. 어떤 행동도 실행하거나 스킬 사용을 소모하지 않는다.
- 일일 보너스의 잘못된 소수 설정, 지원하지 않는 활성 효과 등은 계산 오류로 표시한다. 브라우저에서 임의 계산한 대체 숫자를 보여주지 않는다.

계산 SQL은 현재 Python skill_engine/status_engine 계약을 따라 작성했다. 봇 계산을 바꿀 때는 이 RPC도 함께 검토해야 한다. 테스트에서는 실제 Python 함수와 서버 결과를 비교한다.

## 권한과 동시 수정

화면은 기존 관리자 로그인만 사용한다. 각 RPC는 DB에서 auth.uid()와 profiles.role='admin'을 다시 확인한다. 일반 회원/org_editor/익명은 관리 RPC를 사용할 수 없다. 브라우저에는 기존 publishable key만 유지하며 봇 토큰이나 secret/service_role key를 추가하지 않는다.

수정 가능한 컬럼은 서버에서 name, condition, base_daily_actions, active, 캐릭터별 stat value로 제한한다. 정수 범위를 검증하며 컨디션/기본 행동횟수는 0 이상, 스탯은 음수를 허용한다. bigint ID는 문자열로 왕복하여 JS 정수 정밀도 손실을 피한다.

수치 저장은 캐릭터 및 해당 스탯 행을 잠근 뒤 조회 당시 revision과 비교한다. 다른 수정이 감지되면 전체 저장을 취소한다. 여러 스탯 중 하나라도 실패하면 해당 저장 호출 전체가 롤백된다. 스킬 연결 변경도 캐릭터 행 잠금으로 관리자 요청 간 중복을 방지한다.

**현재 봇을 직접 일시 중지한 뒤 저장·부여·회수해야 한다.** 확인란은 운영자 확인용이지 봇 원격 중지 기능이 아니다. 봇이 여러 DB 요청으로 행동을 처리하므로 홈페이지의 행 잠금/충돌 검사만으로 봇과 동시 실행이 완전히 안전해지는 것은 아니다. 실시간 동시 편집 보장은 봇까지 공통 트랜잭션/잠금 흐름으로 옮기는 별도 작업이 필요하다.

이름은 실제 characters.name에 저장되지만 현재 봇의 get_or_create_character는 다음 게시물 처리 때 commu 이름으로 다시 동기화한다. 이 동작은 이번 홈페이지 변경에서 바꾸지 않았으며 화면에도 안내한다.

## 파일

- script.js: 관리자 route, 메뉴, 로그아웃/이동 처리.
- styles.css: 기존 네이비·하늘색 디자인을 확장한 반응형 관리 레이아웃.
- js/characters.js: 관리자 RPC 연결. 직접 테이블 수정 없음.
- js/character-admin-model.js: 입력 검증, 변경 요약, 효과 설명.
- js/pages/characters-admin.js: 목록/상세/저장/부여/회수 화면.
- sql/character-admin.sql: 기존 테이블용 권한 검증·조회·저장 함수.
- tests/character-admin.test.mjs: UI 계약, RPC 호출 및 로컬 PostgreSQL 테스트.
- tests/fixtures/character-schema.sql: 격리 테스트 전용 최소 스키마.

## 검증

UI 계약 테스트:

```powershell
node --test tests/character-admin.test.mjs
```

전체 PostgreSQL 통합 테스트는 @electric-sql/pglite 0.5.8을 별도의 테스트 폴더에 설치하고, 그 dist/index.js 경로를 PGLITE_MODULE 환경변수로 지정한다. CORE_BOT_PYTHON에는 봇 가상환경 python.exe, CORE_BOT_DIR에는 bot.py가 있는 폴더를 지정하면 실제 Python 계산과의 비교도 실행한다. 변수 없이 실행하면 해당 통합/대조 검사는 skipped라고 명시된다.

실제 운영 데이터 수정이나 실제 스킬 부여 테스트는 하지 않았다. 권한/저장/중복/충돌/횟수 검증은 메모리 안의 격리 PostgreSQL에 가짜 데이터를 넣어 실행했다. 기존 운영 트리거와 추가 제약은 테스트용 최소 스키마와 다를 수 있어, SQL 적용 후 관리자 계정으로 초기 연결 확인이 필요하다.

2026-08-30 검증 결과: Python 엔진 대조를 포함해 15개 테스트 통과, 실패 0개, 건너뜀 0개. JavaScript 구문 검사와 git diff --check도 통과했다. 로그인한 실제 브라우저에서의 클릭 테스트와 운영 DB 적용·배포는 수행하지 않았다.
