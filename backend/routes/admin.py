from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from dependencies import verify_admin_token
from services import admin_service
from services import heygen_service
from services.auth_service import sanitize_user
from services.social_service import create_late_profile
from config import supabase, logger

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users")
async def get_users(filter: str = "all", q: str = None, payload: dict = Depends(verify_admin_token)):
    try:
        return admin_service.get_users(filter, q)
    except Exception as e:
        logger.error(f"Get users error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{telegram_id}")
async def get_user_detail(telegram_id: str, payload: dict = Depends(verify_admin_token)):
    try:
        user = admin_service.get_user_detail(telegram_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get user detail error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{telegram_id}/contenus")
async def get_user_contenus(telegram_id: str, payload: dict = Depends(verify_admin_token)):
    try:
        return admin_service.get_user_contenus(telegram_id)
    except Exception as e:
        logger.error(f"Get user contenus error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_admin_stats(payload: dict = Depends(verify_admin_token)):
    try:
        return admin_service.get_global_stats()
    except Exception as e:
        logger.error(f"Get admin stats error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/invoices")
async def get_all_invoices(limit: int = 100, payload: dict = Depends(verify_admin_token)):
    """Toutes les factures Stripe de tous les clients (nom, montant, statut, PDF)."""
    try:
        from services import billing_service
        return {"invoices": billing_service.list_all_invoices(limit)}
    except Exception as e:
        logger.error(f"Get all invoices error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/export/users")
async def export_users_csv(payload: dict = Depends(verify_admin_token)):
    try:
        csv_content = admin_service.export_users_csv()
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=users_export.csv"}
        )
    except Exception as e:
        logger.error(f"Export users error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/activity")
async def get_activity_logs(limit: int = 50, payload: dict = Depends(verify_admin_token)):
    try:
        return admin_service.get_activity(limit)
    except Exception as e:
        logger.error(f"Get activity error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/users/{telegram_id}/activate")
async def activate_user(telegram_id: str, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").update({"actif": True}).eq("telegram_id", telegram_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        user = result.data[0]

        late_profile_created = False
        late_error = None
        try:
            late_result = await create_late_profile(telegram_id, user.get("nom", ""))
            late_profile_created = late_result["created"]
            late_error = late_result.get("error")
        except Exception as e:
            late_error = str(e)
            logger.warning(f"Failed to create Late profile for {telegram_id}: {e}")

        response = sanitize_user(user)
        response["late_profile_created"] = late_profile_created
        if late_error:
            response["late_error"] = late_error
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Activate user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/users/{telegram_id}/retry-late")
async def retry_late_profile(telegram_id: str, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").select("*").eq("telegram_id", telegram_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")

        user = result.data[0]
        if not user.get("actif"):
            raise HTTPException(status_code=400, detail="L'utilisateur doit être actif pour créer un profil Late")

        try:
            late_result = await create_late_profile(telegram_id, user.get("nom", ""))
            return {"late_profile_created": late_result["created"], "late_error": late_result.get("error")}
        except Exception as e:
            logger.warning(f"Retry Late profile failed for {telegram_id}: {e}")
            return {"late_profile_created": False, "late_error": str(e)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Retry Late error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/users/{telegram_id}/deactivate")
async def deactivate_user(telegram_id: str, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").update({"actif": False}).eq("telegram_id", telegram_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        return sanitize_user(result.data[0])
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Deactivate user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class CreditsUpdate(BaseModel):
    amount: int
    mode: str = "set"  # "set" ou "add"


@router.patch("/users/{telegram_id}/credits")
async def set_credits(telegram_id: str, body: CreditsUpdate, payload: dict = Depends(verify_admin_token)):
    try:
        if body.mode not in ("set", "add"):
            raise HTTPException(status_code=400, detail="mode invalide")
        user = admin_service.update_credits(telegram_id, body.amount, body.mode)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Set credits error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class PlanUpdate(BaseModel):
    plan: str
    reset_credits: bool = True


@router.patch("/users/{telegram_id}/plan")
async def set_plan(telegram_id: str, body: PlanUpdate, payload: dict = Depends(verify_admin_token)):
    try:
        user = admin_service.update_plan(telegram_id, body.plan, body.reset_credits)
        if not user:
            raise HTTPException(status_code=404, detail="Plan invalide ou user introuvable")
        return user
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Set plan error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/users/{telegram_id}/usage")
async def get_user_usage(telegram_id: str, payload: dict = Depends(verify_admin_token)):
    """Jauges de quotas du client (utilisé / plafond / restant par type) + plan courant."""
    try:
        from services import quota_service
        u = quota_service.usage(telegram_id)
        # Nom du plan pour l'affichage admin
        sub = (supabase.table("subscriptions").select("plan_id").eq("user_id", telegram_id)
               .in_("status", ["trialing", "active", "past_due"]).order("created_at", desc=True).limit(1).execute())
        plan_name = None
        if sub.data:
            p = supabase.table("plans").select("name").eq("id", sub.data[0]["plan_id"]).limit(1).execute()
            plan_name = p.data[0]["name"] if p.data else None
        u["plan_name"] = plan_name
        return u
    except Exception as e:
        logger.error(f"Get user usage error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class QuotaBonus(BaseModel):
    action_type: str
    extra_quantity: int  # bonus TOTAL pour la période courante (0 = retirer le bonus)


@router.patch("/users/{telegram_id}/quota-bonus")
async def set_quota_bonus(telegram_id: str, body: QuotaBonus, payload: dict = Depends(verify_admin_token)):
    """Fixe le bonus de quota (extra_quantity) d'un client pour UN type d'action, sur la période en cours.
    N'affecte que ce client ; au renouvellement, le compteur repart sur les quotas du plan."""
    if body.extra_quantity < 0:
        raise HTTPException(status_code=400, detail="extra_quantity doit être >= 0")
    try:
        sub = (supabase.table("subscriptions").select("id, current_period_start, current_period_end")
               .eq("user_id", telegram_id).in_("status", ["trialing", "active", "past_due"])
               .order("created_at", desc=True).limit(1).execute())
        if not sub.data:
            raise HTTPException(status_code=404, detail="Aucun abonnement actif pour ce client")
        s = sub.data[0]
        # Compteur de la période courante : maj s'il existe, sinon création (used=0)
        rows = (supabase.table("usage_counters").select("id, period_start")
                .eq("subscription_id", s["id"]).eq("action_type", body.action_type).execute()).data or []
        from services.quota_service import _parse
        ps = _parse(s["current_period_start"])
        current = [r for r in rows if abs((_parse(r["period_start"]) - ps).total_seconds()) < 5]
        if current:
            supabase.table("usage_counters").update({"extra_quantity": body.extra_quantity}).eq("id", current[0]["id"]).execute()
        else:
            supabase.table("usage_counters").insert({
                "subscription_id": s["id"], "action_type": body.action_type,
                "period_start": s["current_period_start"], "period_end": s["current_period_end"],
                "used_quantity": 0, "extra_quantity": body.extra_quantity,
            }).execute()
        from services import quota_service
        return quota_service.usage(telegram_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Set quota bonus error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SubmagicThemeUpdate(BaseModel):
    submagic_theme_id: Optional[str] = None
    submagic_theme_label: Optional[str] = None


@router.patch("/users/{telegram_id}/submagic-theme")
async def set_submagic_theme(telegram_id: str, body: SubmagicThemeUpdate, payload: dict = Depends(verify_admin_token)):
    """Assigne (ou retire) le thème Submagic de marque d'un compte — userThemeId créé dans l'éditeur."""
    upd = {
        "submagic_theme_id": (body.submagic_theme_id or "").strip() or None,
        "submagic_theme_label": (body.submagic_theme_label or "").strip() or None,
    }
    try:
        supabase.table("users").update(upd).eq("telegram_id", telegram_id).execute()
        return {"success": True, **upd}
    except Exception as e:
        logger.error(f"set_submagic_theme error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/system")
async def get_system(payload: dict = Depends(verify_admin_token)):
    try:
        return admin_service.system_info()
    except Exception as e:
        logger.error(f"System info error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/analytics/refresh")
async def refresh_analytics(payload: dict = Depends(verify_admin_token)):
    from services import analytics_service
    try:
        return await analytics_service.refresh_all()
    except Exception as e:
        logger.error(f"Refresh analytics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/credits/reset-monthly")
async def reset_monthly(payload: dict = Depends(verify_admin_token)):
    try:
        return {"ok": True, "reset": admin_service.reset_monthly_credits()}
    except Exception as e:
        logger.error(f"Reset credits error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class PushBroadcast(BaseModel):
    title: str
    body: str
    telegram_id: Optional[str] = None  # None = tous


@router.post("/push")
async def send_push(body: PushBroadcast, payload: dict = Depends(verify_admin_token)):
    try:
        if not body.title.strip() or not body.body.strip():
            raise HTTPException(status_code=400, detail="Titre et message requis")
        return admin_service.broadcast_push(body.title.strip(), body.body.strip(), body.telegram_id)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin push error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/users/{telegram_id}")
async def delete_user(telegram_id: str, payload: dict = Depends(verify_admin_token)):
    try:
        result = supabase.table("users").delete().eq("telegram_id", telegram_id).execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="User not found")
        return {"success": True, "message": "User deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete user error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# --- Avatar management ---

class AvatarUpdate(BaseModel):
    avatar_id: Optional[str] = None
    status: Optional[str] = None
    consent_url: Optional[str] = None
    error_message: Optional[str] = None


@router.get("/avatars")
async def get_all_avatars(payload: dict = Depends(verify_admin_token)):
    """List all avatar requests."""
    try:
        avatars = heygen_service.get_all_avatars()
        return avatars
    except Exception as e:
        logger.error(f"Get avatars error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/avatars/{telegram_id}")
async def update_avatar(
    telegram_id: str,
    body: AvatarUpdate,
    payload: dict = Depends(verify_admin_token),
):
    """Admin updates avatar info."""
    try:
        update_data = body.model_dump(exclude_none=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")

        result = heygen_service.update_avatar_by_admin(telegram_id, update_data)
        if not result:
            raise HTTPException(status_code=404, detail="Avatar non trouvé")

        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update avatar error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/avatars/{telegram_id}")
async def admin_delete_avatar(telegram_id: str, payload: dict = Depends(verify_admin_token)):
    """Admin deletes an avatar request."""
    try:
        supabase.table("heygen_avatars").delete().eq("telegram_id", telegram_id).execute()
        return {"success": True, "message": "Avatar supprimé"}
    except Exception as e:
        logger.error(f"Admin delete avatar error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =====================================================================
# Quotas & offres — configuration (tout paramétrable, aucune valeur en dur)
# =====================================================================
@router.get("/quota-config")
async def quota_config(payload: dict = Depends(verify_admin_token)):
    """Offres + quotas par type + packs de rachat (pour l'écran admin)."""
    try:
        plans = supabase.table("plans").select("*").order("price_cents").execute().data or []
        quotas = supabase.table("plan_quotas").select("*").execute().data or []
        packs = supabase.table("credit_packs").select("*").order("action_type").execute().data or []
        by_plan = {}
        for q in quotas:
            by_plan.setdefault(q["plan_id"], []).append(q)
        for p in plans:
            p["quotas"] = sorted(by_plan.get(p["id"], []), key=lambda x: x.get("action_type", ""))
        return {"plans": plans, "packs": packs}
    except Exception as e:
        logger.error(f"quota_config error: {e}")
        raise HTTPException(status_code=500, detail="Erreur de chargement de la config")


@router.patch("/plans/{plan_id}")
async def update_plan(plan_id: str, body: dict, payload: dict = Depends(verify_admin_token)):
    upd = {k: body[k] for k in ("name", "price_cents", "billing_period", "is_active") if k in body}
    if not upd:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    try:
        r = supabase.table("plans").update(upd).eq("id", plan_id).execute()
        return {"success": True, "plan": (r.data or [None])[0]}
    except Exception as e:
        logger.error(f"update_plan error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/plan-quotas/{quota_id}")
async def update_plan_quota(quota_id: str, body: dict, payload: dict = Depends(verify_admin_token)):
    upd = {k: body[k] for k in ("included_quantity", "internal_unit_cost_cents", "rollover") if k in body}
    if not upd:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    try:
        r = supabase.table("plan_quotas").update(upd).eq("id", quota_id).execute()
        return {"success": True, "quota": (r.data or [None])[0]}
    except Exception as e:
        logger.error(f"update_plan_quota error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/plan-quotas")
async def create_plan_quota(body: dict, payload: dict = Depends(verify_admin_token)):
    if not body.get("plan_id") or not body.get("action_type"):
        raise HTTPException(status_code=400, detail="plan_id et action_type requis")
    row = {
        "plan_id": body["plan_id"], "action_type": body["action_type"],
        "included_quantity": int(body.get("included_quantity", 0)),
        "internal_unit_cost_cents": int(body.get("internal_unit_cost_cents", 0)),
        "rollover": bool(body.get("rollover", False)),
    }
    try:
        r = supabase.table("plan_quotas").upsert(row, on_conflict="plan_id,action_type").execute()
        return {"success": True, "quota": (r.data or [None])[0]}
    except Exception as e:
        logger.error(f"create_plan_quota error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/credit-packs/{pack_id}")
async def update_pack(pack_id: str, body: dict, payload: dict = Depends(verify_admin_token)):
    upd = {k: body[k] for k in ("action_type", "name", "quantity", "price_cents", "is_active", "stripe_price_id") if k in body}
    if not upd:
        raise HTTPException(status_code=400, detail="Rien à mettre à jour")
    try:
        r = supabase.table("credit_packs").update(upd).eq("id", pack_id).execute()
        return {"success": True, "pack": (r.data or [None])[0]}
    except Exception as e:
        logger.error(f"update_pack error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/credit-packs")
async def create_pack(body: dict, payload: dict = Depends(verify_admin_token)):
    for f in ("action_type", "name", "quantity", "price_cents"):
        if body.get(f) in (None, ""):
            raise HTTPException(status_code=400, detail=f"{f} requis")
    row = {"action_type": body["action_type"], "name": body["name"],
           "quantity": int(body["quantity"]), "price_cents": int(body["price_cents"]),
           "is_active": bool(body.get("is_active", True))}
    try:
        r = supabase.table("credit_packs").insert(row).execute()
        return {"success": True, "pack": (r.data or [None])[0]}
    except Exception as e:
        logger.error(f"create_pack error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/credit-packs/{pack_id}")
async def delete_pack(pack_id: str, payload: dict = Depends(verify_admin_token)):
    try:
        supabase.table("credit_packs").delete().eq("id", pack_id).execute()
        return {"success": True}
    except Exception as e:
        logger.error(f"delete_pack error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
