# 핑후컴퍼니 Naru 배포본

정적 HTML/CSS/Vanilla JavaScript와 Supabase Auth/Data API를 사용하는 배포본입니다. `index.html`을 포함한 폴더 전체를 Naru에 업로드하세요.

## 배포 전 필수 설정

1. `js/supabase.js`의 `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`를 Dashboard의 실제 값으로 교체합니다. Publishable Key만 사용하며 Secret/service_role 키는 넣지 않습니다.
2. Supabase Auth의 Site URL을 `https://pinfu.naru.pub`로 두고 Redirect URLs에 `https://pinfu.naru.pub/**`를 추가합니다.
3. `profiles.nickname`에는 UNIQUE 제약조건이 있어야 닉네임 중복을 동시 요청에서도 확실히 막을 수 있습니다.

## 관리자 지정

관리자 승격 기능은 사이트에 없습니다. SQL Editor에서 실제 관리자 이메일을 넣어 1회 실행하세요.

```sql
UPDATE public.profiles
SET role = 'admin'
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = '관리자 이메일'
);
```

## 데이터 정책 전제

- `posts`: 모두 SELECT, admin만 INSERT/UPDATE/DELETE
- `comments`: 모두 SELECT, 로그인 회원 INSERT, 본인 또는 admin UPDATE
- 일반 댓글 삭제는 `is_deleted = true`로 처리
- `profiles`: 공개 조회 범위에는 이메일 없이 `id`, `nickname`, `role`만 포함
- 사용자가 자신의 `role`을 UPDATE할 수 없도록 RLS/컬럼 권한 유지

`comments.parent_comment_id` 관계는 JavaScript에서 무제한 트리로 변환하며, 화면 들여쓰기만 4단계로 제한합니다.

## JavaScript 구조

- `script.js`: hash routing, 페이지 데이터 로딩, 전역 메뉴 이벤트, 앱 초기화
- `js/ui.js`: 공통 이스케이프, 날짜, 메시지, 로딩 UI 유틸리티
- `js/pages/home.js`: 홈
- `js/pages/company.js`: 회사소개 공통 레이아웃과 콘텐츠 렌더링
- `js/pages/recruit.js`: 채용정보
- `js/pages/board.js`: 게시글 목록
- `js/pages/detail.js`: 게시글 상세, 댓글과 무한 대댓글
- `js/pages/auth-account.js`: 로그인, 회원가입, 마이페이지
- `js/pages/admin.js`: 관리자 게시글 작성과 수정
- `js/data/company-content.js`: CEO 인사말, 인재상, 연혁, 조직도 수정용 데이터
- `js/data/fallback-posts.js`: Supabase 설정 전 홈에 표시하는 보도자료 예시
