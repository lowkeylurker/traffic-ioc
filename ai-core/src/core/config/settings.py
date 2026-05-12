"""Application settings loaded from environment variables."""

from __future__ import annotations

from functools import cached_property

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.core.config.api import ApiSettings
from src.core.config.clustering import ClusteringSettings
from src.core.config.database import DatabaseSettings
from src.core.config.forecast import ForecastSettings
from src.core.config.mart import MartSettings
from src.core.config.models import ModelPathSettings
from src.core.config.rl import RLSettings


class AppSettings(BaseSettings):
	model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

	db_user: str = Field(default="postgres", validation_alias="DB_USER")
	db_password: SecretStr = Field(default=SecretStr("postgres"), validation_alias="DB_PASSWORD")
	db_host: str = Field(default="localhost", validation_alias="DB_HOST")
	db_port: int = Field(default=5432, validation_alias="DB_PORT")
	db_name: str = Field(default="traffic_ioc", validation_alias="DB_NAME")

	api_host: str = Field(default="0.0.0.0", validation_alias="API_HOST")
	api_port: int = Field(default=8000, validation_alias="API_PORT")
	log_level: str = Field(default="INFO", validation_alias="LOG_LEVEL")

	forecast_model_path: str = Field(default="best_forecast_model.pt", validation_alias="FORECAST_MODEL_PATH")
	rl_model_path: str = Field(default="best_rl_agent.pt", validation_alias="RL_MODEL_PATH")
	clustering_model_path: str = Field(default="best_clustering_model.pkl", validation_alias="CLUSTERING_MODEL_PATH")

	forecast_horizon_steps: int = Field(default=12, validation_alias="FORECAST_HORIZON_STEPS")
	forecast_history_window: int = Field(default=12, validation_alias="FORECAST_HISTORY_WINDOW")
	forecast_use_ensemble: bool = Field(default=False, validation_alias="FORECAST_USE_ENSEMBLE")

	rl_algorithm: str = Field(default="dqn", validation_alias="RL_ALGORITHM")
	rl_threshold: float = Field(default=0.5, validation_alias="RL_THRESHOLD")
	rl_time_window_minutes: int = Field(default=15, validation_alias="RL_TIME_WINDOW_MINUTES")

	clustering_algorithm: str = Field(default="kmeans", validation_alias="CLUSTERING_ALGORITHM")
	clustering_num_clusters: int = Field(default=8, validation_alias="CLUSTERING_NUM_CLUSTERS")
	clustering_features: str = Field(
		default="current_speed_kmh,pcu_volume,traffic_index,delay_seconds,quality_flag",
		validation_alias="CLUSTERING_FEATURES",
	)
	clustering_imputation_method: str = Field(default="cluster_mean", validation_alias="CLUSTERING_IMPUTATION_METHOD")

	use_forecast_mart: bool = Field(default=True, validation_alias="AI_USE_FORECAST_MART")
	forecast_mart_self_refresh: bool = Field(default=True, validation_alias="AI_FORECAST_MART_SELF_REFRESH")
	forecast_mart_stale_minutes: int = Field(default=15, validation_alias="AI_FORECAST_MART_STALE_MINUTES")
	forecast_mart_refresh_cooldown_sec: int = Field(default=180, validation_alias="AI_FORECAST_MART_REFRESH_COOLDOWN_SEC")
	forecast_mart_refresh_lookback_days: int = Field(default=1, validation_alias="AI_FORECAST_MART_REFRESH_LOOKBACK_DAYS")

	@cached_property
	def database(self) -> DatabaseSettings:
		return DatabaseSettings(
			user=self.db_user,
			password=self.db_password,
			host=self.db_host,
			port=self.db_port,
			name=self.db_name,
		)

	@cached_property
	def api(self) -> ApiSettings:
		return ApiSettings(host=self.api_host, port=self.api_port, log_level=self.log_level)

	@cached_property
	def models(self) -> ModelPathSettings:
		return ModelPathSettings(
			forecast=self.forecast_model_path,
			rl=self.rl_model_path,
			clustering=self.clustering_model_path,
		)

	@cached_property
	def forecast(self) -> ForecastSettings:
		return ForecastSettings(
			horizon_steps=self.forecast_horizon_steps,
			history_window=self.forecast_history_window,
			use_ensemble=self.forecast_use_ensemble,
		)

	@cached_property
	def rl(self) -> RLSettings:
		return RLSettings(
			algorithm=self.rl_algorithm,
			threshold=self.rl_threshold,
			time_window_minutes=self.rl_time_window_minutes,
		)

	@cached_property
	def clustering(self) -> ClusteringSettings:
		return ClusteringSettings(
			algorithm=self.clustering_algorithm,
			num_clusters=self.clustering_num_clusters,
			features=self.clustering_feature_list,
			imputation_method=self.clustering_imputation_method,
		)

	@cached_property
	def mart(self) -> MartSettings:
		return MartSettings(
			use_forecast_mart=self.use_forecast_mart,
			self_refresh=self.forecast_mart_self_refresh,
			stale_minutes=self.forecast_mart_stale_minutes,
			refresh_cooldown_sec=self.forecast_mart_refresh_cooldown_sec,
			refresh_lookback_days=self.forecast_mart_refresh_lookback_days,
		)

	@property
	def database_url(self) -> str:
		return self.database.url

	@cached_property
	def clustering_feature_list(self) -> list[str]:
		return [feature.strip() for feature in self.clustering_features.split(",") if feature.strip()]


settings = AppSettings()

__all__ = ["AppSettings", "settings"]