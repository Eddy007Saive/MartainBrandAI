import asyncio
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from config import CORS_ORIGINS, ANALYTICS_CRON_HOURS, logger
from services import analytics_service
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.admin import router as admin_router
from routes.contenus import router as contenus_router
from routes.commentaires import router as commentaires_router
from routes.analytics import router as analytics_router
from routes.brouillons import router as brouillons_router
from routes.heygen import router as heygen_router
from routes.agent import router as agent_router
from routes.late import router as late_router
from routes.notifications import router as notifications_router
from routes.billing import router as billing_router
from routes.inbox import router as inbox_router
from routes.accounts import router as accounts_router
from routes.onboarding import router as onboarding_router
from routes.video import router as video_router

app = FastAPI()

# API router
api_router = APIRouter(prefix="/api")


@api_router.get("/")
async def root():
    return {"message": "API is running"}


# Include all route modules
api_router.include_router(auth_router)
api_router.include_router(users_router)
api_router.include_router(admin_router)
api_router.include_router(contenus_router)
api_router.include_router(commentaires_router)
api_router.include_router(analytics_router)
api_router.include_router(brouillons_router)
api_router.include_router(heygen_router)
api_router.include_router(agent_router)
api_router.include_router(late_router)
api_router.include_router(notifications_router)
api_router.include_router(billing_router)
api_router.include_router(inbox_router)
api_router.include_router(accounts_router)
api_router.include_router(onboarding_router)
api_router.include_router(video_router)

app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


_cron_task = None


async def _analytics_cron():
    """Rafraîchit le cache analytics toutes les ANALYTICS_CRON_HOURS heures."""
    interval = ANALYTICS_CRON_HOURS * 3600
    # Petit délai initial pour ne pas charger au boot
    await asyncio.sleep(60)
    while True:
        try:
            await analytics_service.refresh_all()
        except Exception as e:
            logger.error(f"analytics cron loop: {e}")
        await asyncio.sleep(interval)


@app.on_event("startup")
async def startup():
    global _cron_task
    if ANALYTICS_CRON_HOURS and ANALYTICS_CRON_HOURS > 0:
        _cron_task = asyncio.create_task(_analytics_cron())
        logger.info(f"Cron analytics activé (toutes les {ANALYTICS_CRON_HOURS} h)")


@app.on_event("shutdown")
async def shutdown():
    if _cron_task:
        _cron_task.cancel()


# Lancement direct (Railway/Docker) : lit le port depuis $PORT, sans dépendre de l'expansion shell.
if __name__ == "__main__":
    import os
    import uvicorn
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run("server:app", host="0.0.0.0", port=port)
