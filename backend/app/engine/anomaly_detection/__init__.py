"""
Moteur de Détection d'Anomalies Comportementales pour IDPS.

Architecture basée sur les patterns SOLID :
- Strategy : Moteurs de détection interchangeables
- Chain of Responsibility : Pipeline d'analyse modulaire
- Observer : Système d'alerting découplé
- Factory : Instanciation dynamique des règles

Composants principaux :
- State Store : Gestion d'état dynamique par IP avec FSM
- Baseline Profiler : Réduction des faux positifs par apprentissage
- Correlation Engine : Agrégation de signaux faibles en incidents
- Analysis Pipeline : Traitement séquentiel des paquets
- Alert Manager : Notification multi-canal des alertes
"""

from .interfaces import (
    PacketContext,
    DetectionResult,
    CorrelatedIncident,
    Severity,
    ResponseAction,
    IDetectionStrategy,
    ICorrelationEngine,
    IAlertObserver,
    IStateStore,
    IBaselineProfiler,
    IRuleFactory
)

from .state_store import state_store, IPState, FSMState
from .baseline_profiler import baseline_profiler, MetricBaseline
from .detectors import (
    PortScanDetectionStrategy,
    SYNFloodDetectionStrategy,
    AuthFailureDetectionStrategy,
    BehavioralAnomalyDetectionStrategy,
    FSMTransitionDetectionStrategy,
    DetectionStrategyFactory
)
from .pipeline import analysis_pipeline, AnalysisPipeline
from .alerting import (
    alert_manager,
    DatabaseObserver,
    WebSocketObserver,
    FirewallObserver,
    EmailObserver,
    MetricsObserver
)
from .rule_factory import rule_manager, RuleFactory, RuleManager
from .correlation import correlation_engine, CorrelationEngine, Signal, CorrelationPattern

__all__ = [
    # Interfaces
    "PacketContext",
    "DetectionResult",
    "CorrelatedIncident",
    "Severity",
    "ResponseAction",
    "IDetectionStrategy",
    "ICorrelationEngine",
    "IAlertObserver",
    "IStateStore",
    "IBaselineProfiler",
    "IRuleFactory",
    
    # State Store
    "state_store",
    "IPState",
    "FSMState",
    
    # Baseline Profiler
    "baseline_profiler",
    "MetricBaseline",
    
    # Detectors
    "PortScanDetectionStrategy",
    "SYNFloodDetectionStrategy",
    "AuthFailureDetectionStrategy",
    "BehavioralAnomalyDetectionStrategy",
    "FSMTransitionDetectionStrategy",
    "DetectionStrategyFactory",
    
    # Pipeline
    "analysis_pipeline",
    "AnalysisPipeline",
    
    # Alerting
    "alert_manager",
    "DatabaseObserver",
    "WebSocketObserver",
    "FirewallObserver",
    "EmailObserver",
    "MetricsObserver",
    
    # Rule Factory
    "rule_manager",
    "RuleFactory",
    "RuleManager",
    
    # Correlation
    "correlation_engine",
    "CorrelationEngine",
    "Signal",
    "CorrelationPattern",
]

__version__ = "1.0.0"
