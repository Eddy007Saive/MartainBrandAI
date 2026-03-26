from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware
from config import CORS_ORIGINS
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.admin import router as admin_router
from routes.contenus import router as contenus_router
from routes.commentaires import router as commentaires_router
from routes.analytics import router as analytics_router
from routes.brouillons import router as brouillons_router
from routes.heygen import router as heygen_router

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

app.include_router(api_router)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    pass
