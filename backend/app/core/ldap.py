# SPDX-License-Identifier: GPL-3.0-or-later
"""
LDAP/Active Directory authentication.
"""
import logging
from typing import Optional

from ldap3 import Server, Connection, ALL, SUBTREE
from app.config import settings
from app.models.user import UserRole

logger = logging.getLogger(__name__)


class LDAPAuthenticator:
    def __init__(self) -> None:
        self.server = Server(
            settings.LDAP_SERVER,
            port=settings.LDAP_PORT,
            use_ssl=settings.LDAP_USE_SSL,
            get_info=ALL,
        )

    def authenticate(self, username: str, password: str) -> Optional[dict]:
        """Authenticate user against LDAP and return user info dict or None."""
        user_info = self.search_user(username)
        if user_info is None:
            return None
        try:
            conn = Connection(
                self.server,
                user=user_info["dn"],
                password=password,
                auto_bind=True,
            )
            conn.unbind()
            user_info["role"] = self.map_groups_to_role(user_info.get("groups", []))
            return user_info
        except Exception:
            logger.debug("LDAP bind failed for user %s", username)
            return None

    def search_user(self, username: str) -> Optional[dict]:
        """Search for a user in LDAP directory."""
        try:
            bind_dn = settings.LDAP_BIND_DN
            bind_pw = settings.LDAP_BIND_PASSWORD
            conn = Connection(
                self.server,
                user=bind_dn,
                password=bind_pw,
                auto_bind=True,
            )
            # Escape LDAP special characters to prevent injection
            safe_username = username.replace("\\", "\\5c").replace("*", "\\2a").replace("(", "\\28").replace(")", "\\29").replace("\x00", "\\00")
            search_filter = settings.LDAP_USER_FILTER.replace("{username}", safe_username)
            conn.search(
                settings.LDAP_BASE_DN,
                search_filter,
                search_scope=SUBTREE,
                attributes=["cn", "mail", "sAMAccountName", settings.LDAP_GROUP_ATTR],
            )
            if not conn.entries:
                conn.unbind()
                return None
            entry = conn.entries[0]
            groups = (
                [str(g) for g in entry[settings.LDAP_GROUP_ATTR].values]
                if settings.LDAP_GROUP_ATTR in entry
                else []
            )
            result = {
                "dn": str(entry.entry_dn),
                "username": str(entry["sAMAccountName"]) if "sAMAccountName" in entry else username,
                "full_name": str(entry["cn"]) if "cn" in entry else username,
                "email": str(entry["mail"]) if "mail" in entry else f"{username}@{settings.LDAP_BASE_DN}",
                "groups": groups,
            }
            conn.unbind()
            return result
        except Exception:
            logger.exception("LDAP search failed for user %s", username)
            return None

    def map_groups_to_role(self, groups: list[str]) -> UserRole:
        for group in groups:
            if settings.LDAP_ADMIN_GROUP.lower() in group.lower():
                return UserRole.ADMIN
            if settings.LDAP_OPERATOR_GROUP.lower() in group.lower():
                return UserRole.OPERATOR
        return UserRole.VIEWER
