// VOD 다운로드 중계 Worker
//
// 하는 일: /?url=<mp4주소> 로 들어온 요청을 받아서, 허용된 영상 서버에서
// 파일을 가져와 "스트리밍"으로 그대로 흘려보낸다. 파일을 메모리에 통째로
// 담지 않고 바로 흘려보내기 때문에 몇 GB짜리 영상도 문제없다.
//
// Vercel과 달리 Worker는 전송량(GB)에 과금이 없어서, 이 중계를 여기서 하면
// Vercel 사용량이 더 이상 늘지 않는다.

// 중계를 허용할 영상 서버 호스트 (오픈 프록시로 악용되지 않도록 제한)
const ALLOWED_HOSTS = new Set(["vod.sdijon.com"]);

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // 브라우저 JS에서 호출할 때의 CORS 사전 요청 처리
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    const target = url.searchParams.get("url");
    if (!target) {
      return new Response("missing ?url=", { status: 400, headers: corsHeaders() });
    }

    let upstream;
    try {
      upstream = new URL(target);
    } catch {
      return new Response("bad url", { status: 400, headers: corsHeaders() });
    }

    // 허용된 호스트가 아니면 거절 (악용 방지)
    if (!ALLOWED_HOSTS.has(upstream.hostname)) {
      return new Response("host not allowed", { status: 403, headers: corsHeaders() });
    }

    // Range 헤더를 그대로 넘겨서 "이어받기 / 구간 요청 / 탐색"이 동작하게 함
    const fwdHeaders = new Headers();
    const range = request.headers.get("Range");
    if (range) fwdHeaders.set("Range", range);

    // 영상 서버가 Referer / User-Agent를 검사해서 막는 경우 대비.
    // (리다이렉트로는 통과 못 하고 프록시가 필요한 이유가 보통 이거다)
    fwdHeaders.set("Referer", "https://vod.sdijon.com/");
    fwdHeaders.set(
      "User-Agent",
      request.headers.get("User-Agent") || "Mozilla/5.0"
    );

    const resp = await fetch(upstream.toString(), {
      method: "GET",
      headers: fwdHeaders,
    });

    // 응답 헤더: 원본의 Content-Length / Content-Range / Accept-Ranges 는 유지하고
    // 다운로드 저장용 파일명 + CORS 만 추가한다.
    const headers = new Headers(resp.headers);

    const rawName = upstream.pathname.split("/").pop() || "video.mp4";
    const filename = decodeURIComponent(rawName);
    // 한글 파일명 깨짐 방지: filename* (UTF-8) 사용
    headers.set(
      "Content-Disposition",
      `attachment; filename="video.mp4"; filename*=UTF-8''${encodeURIComponent(filename)}`
    );

    for (const [k, v] of Object.entries(corsHeaders())) headers.set(k, v);

    // resp.body 는 스트림. 그대로 넘기면 버퍼링 없이 흘러간다.
    // status 는 200(전체) 또는 206(구간) 을 그대로 전달.
    return new Response(resp.body, {
      status: resp.status,
      statusText: resp.statusText,
      headers,
    });
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Content-Type",
    "Access-Control-Expose-Headers":
      "Content-Length, Content-Range, Accept-Ranges, Content-Disposition",
  };
}
