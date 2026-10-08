# VOD 다운로드 중계 Worker

Vercel 함수가 영상 바이트를 통과시키느라 전송량 한도가 터지는 문제를,
그 중계만 Cloudflare Worker로 옮겨 해결한다. (Worker는 전송량 과금 없음)

## 배포

```bash
cd cloudflare-worker
npm install -g wrangler      # 또는 npx 로 그때그때 실행
wrangler login               # 브라우저로 Cloudflare 로그인
wrangler deploy
```

배포되면 주소가 나온다:
```
https://vod-proxy.<본인계정>.workers.dev
```

## 로컬 테스트

```bash
wrangler dev
# 다른 터미널에서:
curl -I "http://localhost:8787/?url=https://vod.sdijon.com/강기원/d-math-ggw-251227-a/d-math-ggw-251227-a_default_1080p.spk.mp4"
```
`200 OK` 또는 `206 Partial Content` 와 `Content-Disposition` 이 보이면 정상.

## 프론트엔드(Vercel 쪽) 연결

다운로드 링크가 지금은 Vercel API route(예: `/api/download?...`)를 가리킬 텐데,
그걸 Worker 주소로만 바꾸면 끝이다:

```js
const WORKER = "https://vod-proxy.<본인계정>.workers.dev";

// 기존 mp4 원본 주소를 그대로 감싸주면 됨
const downloadUrl = `${WORKER}/?url=${encodeURIComponent(mp4Url)}`;
// <a href={downloadUrl} download>다운로드</a>
```

이렇게 하면 카탈로그/UI 는 Vercel에 그대로 두고, 무거운 영상 바이트만
Cloudflare를 통해 나가므로 Vercel 전송량이 더 이상 늘지 않는다.

## 참고 / 주의

- **허용 호스트 제한**: `worker.js` 의 `ALLOWED_HOSTS` 에 `vod.sdijon.com` 만
  넣어 두었다. 다른 영상 서버가 생기면 여기에 추가. (오픈 프록시 악용 방지)
- **Referer 위장**: 영상 서버가 Referer 로 막는 경우를 대비해 Worker가
  `Referer: https://vod.sdijon.com/` 을 붙인다. 만약 서버가 토큰/서명 URL이나
  쿠키 인증을 요구하면, 그 토큰을 Worker에서 생성/전달하도록 추가해야 한다.
- **무료 한도**: Workers 무료 플랜은 하루 100,000 요청. 단순 중계는 CPU를
  거의 안 쓰므로 전송량이 아니라 "요청 횟수"만 신경쓰면 된다.
- **엣지 캐시(선택)**: 같은 영상을 반복 다운로드한다면 `fetch(...)` 에
  `cf: { cacheEverything: true, cacheTtl: 86400 }` 를 추가해 재다운로드를
  Cloudflare 엣지에서 처리할 수 있다. (단 무료 플랜은 캐시 가능 파일 크기
  상한이 있어 대용량 파일은 캐시가 안 될 수 있음)
