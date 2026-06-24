from fastapi import APIRouter, HTTPException, Depends
from dependencies import verify_token
from services import inbox_service

router = APIRouter(prefix="/inbox", tags=["inbox"])


@router.get("")
async def list_inbox(platform: str = None, payload: dict = Depends(verify_token)):
    telegram_id = payload.get("telegram_id")
    if not telegram_id:
        raise HTTPException(status_code=400, detail="Invalid token")
    return await inbox_service.list_inbox(telegram_id, platform=platform)


@router.get("/post/{post_id}")
async def post_comments(post_id: str, account_id: str, payload: dict = Depends(verify_token)):
    if not payload.get("telegram_id"):
        raise HTTPException(status_code=400, detail="Invalid token")
    return await inbox_service.post_comments(post_id, account_id)


@router.post("/reply")
async def reply(body: dict, payload: dict = Depends(verify_token)):
    if not payload.get("telegram_id"):
        raise HTTPException(status_code=400, detail="Invalid token")
    post_id = body.get("post_id"); account_id = body.get("account_id"); message = (body.get("message") or "").strip()
    if not (post_id and account_id and message):
        raise HTTPException(status_code=400, detail="post_id, account_id et message requis")
    r = await inbox_service.reply(post_id, account_id, message, comment_id=body.get("comment_id"))
    if not r.get("ok"):
        raise HTTPException(status_code=400, detail=r.get("error"))
    return r


@router.post("/action")
async def action(body: dict, payload: dict = Depends(verify_token)):
    if not payload.get("telegram_id"):
        raise HTTPException(status_code=400, detail="Invalid token")
    kind = body.get("kind"); post_id = body.get("post_id"); comment_id = body.get("comment_id"); account_id = body.get("account_id")
    if not (kind and post_id and comment_id and account_id):
        raise HTTPException(status_code=400, detail="kind, post_id, comment_id, account_id requis")
    r = await inbox_service._action(kind, post_id, comment_id, account_id)
    if not r.get("ok"):
        raise HTTPException(status_code=400, detail=r.get("error"))
    return r
