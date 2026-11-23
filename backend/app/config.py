from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Lee la configuracion desde las variables de entorno o el archivo .env.

    Las credenciales (DATABASE_URL y JWT_SECRETO) no tienen valor por
    defecto: si faltan, la API no arranca (HU-23). Vienen del .env en local,
    de Secret Manager en Cloud Run y del Secret punto360-secret en Kubernetes.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str

    # --- Autenticacion -------------------------------------------------------
    jwt_secreto: str
    jwt_algoritmo: str = "HS256"
    jwt_minutos: int = 480  # 8 horas: un turno de caja

    # --- CORS ----------------------------------------------------------------
    # Lista separada por comas. Al desplegar se agrega la URL del frontend.
    cors_origenes: str = "http://localhost:5173,http://127.0.0.1:5173"

    @field_validator("jwt_secreto")
    @classmethod
    def _secreto_robusto(cls, valor: str) -> str:
        valor = valor.strip()
        # Las plantillas (.env.example, secret.example.yaml) usan valores que
        # empiezan por CAMBIAR: si alguien las copia sin editar, no arranca.
        if len(valor) < 32 or valor.upper().startswith("CAMBIAR"):
            raise ValueError(
                "JWT_SECRETO debe tener al menos 32 caracteres y no ser un valor "
                "de ejemplo. Genera uno con: "
                'python -c "import secrets; print(secrets.token_hex(32))"'
            )
        return valor

    @property
    def lista_cors(self) -> list[str]:
        return [o.strip() for o in self.cors_origenes.split(",") if o.strip()]


settings = Settings()
