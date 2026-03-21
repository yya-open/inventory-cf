// functions/api/_confirm.ts
export async function requireConfirm(req, expected, message = "确认内容不正确") {
    let body = {};
    try {
        body = await req.json();
    }
    catch {
        body = {};
    }
    const got = String(body?.confirm ?? body?.confirmText ?? body?.confirm_text ?? "")
        .trim();
    if (!got || got !== String(expected).trim()) {
        return new Response(JSON.stringify({
            ok: false,
            message,
            expected,
        }), {
            status: 400,
            headers: { "content-type": "application/json; charset=utf-8" },
        });
    }
    return null;
}
