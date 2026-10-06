# 핑후컴퍼니 Naru 배포본

Naru에 배포하는 정적 HTML/CSS/Vanilla JavaScript SPA입니다. Supabase Auth/Data API를 사용하며 별도 빌드 과정이나 백엔드 서버가 없습니다.

```bash
python -m http.server 8000
```

`index.html`이 있는 프로젝트 루트에서 위 명령으로 실행할 수 있습니다.

## 역할

- `user`: 공개 조직도와 프로필을 조회합니다. 조직도 프로필을 생성하거나 관리할 수 없습니다.
- `org_editor`: 자신의 조직도 프로필과 INNER custom field 값만 생성·수정합니다. 캔버스, 노드, 연결선, 템플릿, 역할을 관리할 수 없으며 게시글 Admin 권한도 없습니다.
- `admin`: 기존 게시글 CRUD와 함께 모든 조직도 프로필, 캔버스, OUTER/INNER 템플릿, 사용자 역할을 관리합니다.

프런트엔드 권한 UI와 별도로 실제 데이터 권한은 이미 구성된 Supabase RLS/RPC가 담당합니다. 사용자 역할 변경은 `set_user_role` RPC, 활성 템플릿 변경은 `activate_org_template` RPC만 사용합니다.

## Route

- `#/company/organization`: 공개 조직도 Viewer
- `#/company/organization/:profileId`: 개별 상세 프로필
- `#/account/organization`: `org_editor` 또는 `admin`의 자기 프로필 작성·수정
- `#/admin/organization`: Admin 조직도 Canvas GUI
- `#/admin/organization?tab=profiles`: Admin 프로필 관리
- `#/admin/organization/templates`: OUTER/INNER Template GUI
- `#/admin/organization/users`: 사용자 역할 관리
- `#/admin/characters`: 관리자 캐릭터 수치·스킬 관리 (설치: CHARACTER_ADMIN.md)
- `#/admin/skills`: 공유 스킬 생성·효과/조건 관리 (설치: SKILL_ADMIN.md)
- `#/admin/actions`: 행동 생성·기본 컨디션/스탯 효과·조건 관리 (설치: ACTION_ADMIN.md)
- `#/admin/stats`: 공통 스탯 정의 생성·수정 (이번 보완 설치: ADMIN_REFINEMENTS.md)
- 스킬 효과의 대상 명령 옆에서 새 행동 명령 등록 가능 (추가 설치: SKILL_COMMAND_ADMIN.md)

기존 홈, 회사소개, 채용정보, 보도자료, 회사자료, 게시글/댓글, 로그인/회원가입, 마이페이지, 게시글 Admin route는 그대로 유지됩니다.

## 조직도 데이터 용도

- `org_profiles`: 이름, 부서, 직급, 외부 이미지 URL과 Owner를 저장합니다.
- `org_profile_details`: INNER custom field 값을 `field_values` JSON으로 저장합니다. 프로필 생성 Trigger가 행을 생성하므로 프런트에서는 UPDATE만 합니다.
- `org_nodes`: Canvas의 PROFILE, GROUP, LABEL 노드 위치·크기·구조화 설정을 저장합니다. PROFILE의 `parent_node_id`는 소속 GROUP을 가리키며 좌표나 Edge와 독립적으로 관리됩니다.
- `org_edges`: 노드 사이 연결선과 구조화 설정을 저장합니다.
- `org_templates`: OUTER 카드 디자인과 INNER 상세 양식의 구조화된 `schema_data`를 저장합니다. HTML/JavaScript 문자열을 실행하지 않습니다.
- `org_settings`: `key = canvas`에 전체 Canvas 크기, 배경, Grid, Snap 설정을 저장합니다.

`org_profiles`에 등록된 사람은 자동으로 공개되지 않습니다. Admin이 해당 프로필을 PROFILE node로 Canvas에 배치해야 공개 조직도에 나타납니다.

공개 Viewer는 카드 가독성을 위해 항상 100% 크기로 표시합니다. 빈 Canvas를 드래그해 이동하고, 왼쪽 `조직 바로가기`에서 GROUP 또는 PROFILE을 선택해 해당 위치를 중앙으로 이동합니다. Navigator의 접기/펼치기는 목록에만 적용되며 Canvas 데이터는 변경하지 않습니다.

## Admin 조직도 GUI

- 클릭으로 단일 선택, Shift/Ctrl/Cmd+클릭으로 다중 선택 및 선택 요소 함께 Drag
- 선택 노드 모서리 Handle 직접 Resize
- 빈 Canvas Drag Pan
- 버튼·Wheel Zoom과 Fit
- Grid 표시, Grid size, Snap-to-grid
- PROFILE Property Panel에서 소속 GROUP 지정
- GROUP 이동 시 소속 PROFILE 동반 이동
- 다중 선택 왼쪽/가운데/오른쪽·위/가운데/아래 정렬, 3개 이상 동일 간격, 현재 화면 중앙 이동
- GROUP/LABEL 생성과 Property Panel 편집
- 미배치 프로필 Drag & Drop 또는 배치 버튼
- 연결선 모드에서 Source → Target 클릭으로 직각 Edge 생성
- Edge 선택·삭제 및 노드 이동 시 즉시 재계산
- Node/Edge 추가·삭제·이동·Resize·속성 변경 Undo/Redo
- 변경사항은 Local State에 유지하고 `저장` 버튼에서만 Supabase 반영
- 미저장 상태에서 route 이동 또는 창 닫기 경고

## Template GUI

### OUTER

공개 조직도의 PROFILE 카드 공통 디자인입니다. 이름, 소속, 직급, 이미지 필드를 Preview 위에서 직접 Drag하며 선택 필드의 Handle로 Resize합니다. `＋ 텍스트`로 프로필 데이터와 무관한 `STATIC_TEXT` 요소를 추가할 수 있습니다. Shift/Ctrl/Cmd+클릭으로 여러 필드를 선택해 함께 이동하거나 정렬·동일 간격·카드 기준 중앙 배치를 할 수 있습니다. Property Panel에서 표시 여부, 텍스트 내용·정렬·색상, 글자 크기/굵기, 배경·테두리, 이미지 fit/position, 카드 크기·배경·테두리·radius·padding을 조정합니다.

카드와 각 OUTER 요소에는 `property:value` 선언만 받는 고급 CSS 입력란이 있습니다. 허용 목록에 포함된 선언만 파싱하여 기본 GUI 스타일 뒤에 적용하고, `@import`, `url()`, `expression()`, `javascript:`, `<script>`, `<style>`, `position` 등 위험하거나 레이아웃 범위를 벗어나는 선언은 무시합니다. 원문은 OUTER `schema_data` JSON에만 저장하며 동적 stylesheet나 `<style>` 요소를 만들지 않습니다.

### INNER

상세 프로필 양식입니다. `text`, `textarea`, `number`, `date`, `url`, `select`, `image` field를 GUI로 추가하고 필드 블록 Drag & Drop으로 순서를 변경합니다. Custom field의 stable ID는 최초 생성 후 유지됩니다. `image`는 파일이 아니라 외부 이미지 URL field입니다.

## 외부 프로필 이미지

Supabase Storage와 파일 업로드를 사용하지 않습니다. `input type="file"`도 없습니다. 모든 프로필 이미지는 `org_profiles.image_url` 또는 INNER image field에 HTTPS 외부 URL로 입력하며 입력 화면에서 미리보기를 제공합니다. `javascript:`, `data:`, `file:`, `blob:` 등의 scheme은 허용하지 않습니다.

## JavaScript 구조

- `script.js`: hash routing, page data loading, 전역 메뉴·인증 UI, 초기화
- `js/auth.js`: Supabase Auth와 `user/org_editor/admin` 상태
- `js/organization.js`: 조직도 Supabase Data API/RPC 접근
- `js/organization-schema.js`: Canvas·OUTER·INNER schema 정규화, stable ID, URL 검사
- `js/organization-view.js`: 카드, 상세 field, Edge 안전 렌더링
- `js/organization-editor/state.js`: Canvas Local State와 Undo/Redo
- `js/organization-editor/alignment.js`: Node와 OUTER field의 Bounding Box·정렬·분배 계산
- `js/pages/organization.js`: 공개 Viewer
- `js/pages/organization-detail.js`: 상세 프로필
- `js/pages/organization-profile-editor.js`: 자기 프로필 입력
- `js/pages/organization-admin.js`: Canvas와 Admin 프로필 관리
- `js/pages/organization-template-editor.js`: OUTER/INNER GUI
- `js/pages/organization-users-admin.js`: 닉네임 검색과 role RPC
- `js/pages/*`: 기존 홈, 회사소개, 게시판, 계정, 게시글 Admin 화면
- `js/ui.js`, `js/markdown.js`: 공통 안전 렌더링과 게시글 Markdown

## 배포 설정

### 커뮤니티 Markdown·좋아요·저장

익명게시판·종목토론방의 본문과 댓글은 `js/markdown.js`로 Markdown을 표시합니다. HTML은 이스케이프하고 위험한 링크 scheme은 차단합니다. 글 목록·상세의 좋아요와 저장은 로그인 사용자별로 유지되며 각 게시판의 `저장한 글`에서 모아 볼 수 있습니다.

기존 `sql/community.sql` 다음에 `sql/community-reactions.sql`을 한 번 적용합니다. 좋아요 수는 DB trigger로 관리하고, `community_post_actions`는 본인 기록만 읽기·추가·삭제할 수 있습니다. 재시도해도 결과가 뒤집히지 않는 authenticated 전용 RPC를 사용합니다. 목록 20개와 lookahead 1개, bounded batch 조회를 유지하며 exact count와 realtime은 사용하지 않습니다.

추가 검증: `tests/community-reactions-rls.sql`은 실제 DB에서 실행하며 모든 테스트 데이터를 rollback합니다. `tests/community-browser.mjs`는 격리된 API fixture로 데스크톱·모바일 회귀와 Markdown·좋아요·저장 유지 및 해제를 확인합니다.

브라우저에는 `js/supabase.js`의 Publishable Key만 사용합니다. Secret/service_role key를 넣지 않습니다. Supabase Auth의 Site URL과 Redirect URL은 실제 운영 주소 `https://pinfu.naru.pub` 기준으로 유지합니다.
