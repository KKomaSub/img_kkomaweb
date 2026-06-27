# img_kkomaweb Cloudflare Pages 버전

Vercel 서버리스 구조를 Cloudflare Pages + Pages Functions 구조로 바꾼 버전입니다.

## 반영 내용

- 이미지 파일은 그대로 imgbb에 업로드합니다.
- MP4, MOV, WEBM, MKV, AVI, WMV, FLV, MPEG/MPG, 3GP, OGV, TS 등 대부분의 동영상과 GIF는 브라우저에서 `ffmpeg.wasm`으로 APNG로 변환한 뒤 `.png` 확장자로 imgbb에 업로드합니다.
- 공유 링크에서 `name` 파라미터를 제거했습니다.
  - 공유 링크: `https://내도메인.pages.dev/?id=이미지ID`
  - RAW 링크: `https://내도메인.pages.dev/?id=이미지ID&raw=1`
- `?id=...&raw=1`은 Cloudflare Pages Function에서 가로채 HTML이 아니라 실제 raw 이미지 바이트만 반환합니다.
- 기존 호환을 위해 `/api/image?id=...&name=...`도 계속 지원합니다.
- APNG 파일의 공유 페이지에서는 우클릭/다운로드 버튼이 자동으로 `APNG → MP4` 변환 다운로드를 제공합니다.
- `?id=...&format=mp4`는 `/convert.html`로 연결되어 브라우저에서 빠르게 MP4 변환을 실행합니다.

## 중요한 제한

Cloudflare Pages Functions는 네이티브 `ffmpeg` 실행 환경이 아니므로 서버 함수에서 APNG를 즉시 MP4로 인코딩해 raw 응답으로 반환하는 방식은 안정적으로 구현할 수 없습니다. 그래서 업로드 전 동영상/GIF → APNG 변환과 APNG → MP4 다운로드 변환은 브라우저의 `ffmpeg.wasm`에서 처리합니다.

즉:

- `?raw=1` : 순수 raw APNG/PNG 이미지 바이트 반환
- `?format=mp4` 또는 공유 페이지의 MP4 다운로드 버튼 : 브라우저에서 APNG를 받아 MP4로 변환 후 다운로드

## Cloudflare Pages 배포 방법

### 1. GitHub main 브랜치에 업로드

이 폴더 전체를 `KKomaSub/img_kkomaweb` 저장소의 `main` 브랜치 루트에 올립니다.

### 2. Cloudflare Pages 설정

Cloudflare Pages에서 다음처럼 설정합니다.

- Framework preset: `None`
- Build command: 비워두거나 `npm run check`
- Build output directory: `public`
- Functions directory: `functions`

### 3. 환경변수 설정 권장

Pages 프로젝트의 Settings → Environment variables에 다음 값을 넣는 것을 권장합니다.

```txt
IMGBB_API_KEY=본인_imgbb_api_key
```

기존 ZIP에 포함된 imgbb 키는 호환용 fallback으로 남겨두었습니다. 실제 운영에서는 환경변수 사용을 권장합니다.

### 4. 로컬 테스트

```bash
npm install
npm run dev
```

문법 검사:

```bash
npm run check
```

## 파일 구조

```txt
public/
  index.html              업로드/공유 페이지
  convert.html            APNG → MP4 변환 페이지
  assets/media-tools.js   ffmpeg.wasm 변환 유틸
functions/
  api/upload.js           imgbb 업로드 프록시
  api/image.js            imgbb raw 이미지 프록시
  [[path]].js             ?raw=1 공유 링크 raw 응답 처리
  _lib/                   공통 로직
```
