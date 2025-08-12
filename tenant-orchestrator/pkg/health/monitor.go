package health

import (
	"context"
	"fmt"

	tenantv1alpha1 "github.com/grg-automation/multi-saas-crm/tenant-orchestrator/api/v1alpha1"
	"github.com/grg-automation/multi-saas-crm/tenant-orchestrator/pkg/discovery"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	appsv1 "k8s.io/api/apps/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/log"
)

var (
	tenantHealth = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Name: "tenant_health_status",
			Help: "Health status of tenant services (1 = healthy, 0 = unhealthy)",
		},
		[]string{"tenant", "service"},
	)
)

// Monitor manages tenant health checks
type Monitor struct {
	client    client.Client
	discovery *discovery.Client
}

// NewMonitor creates a new health monitor
func NewMonitor(c client.Client, d *discovery.Client) *Monitor {
	return &Monitor{
		client:    c,
		discovery: d,
	}
}

// CheckTenantHealth checks the health of all services for a tenant
func (m *Monitor) CheckTenantHealth(ctx context.Context, tenant *tenantv1alpha1.Tenant) (bool, error) {
	log := log.FromContext(ctx).WithValues("tenant", tenant.Name)
	overallHealthy := true
	var healthErrors []string

	// Check service health using discovery client
	endpoints := m.discovery.GetTenantEndpoints(tenant.Name)
	for _, ep := range endpoints {
		healthStatus := m.discovery.CheckServiceHealth(ctx, ep)
		tenantHealth.WithLabelValues(tenant.Name, ep.Service).Set(boolToFloat64(healthStatus.Status == "healthy"))
		if healthStatus.Status != "healthy" {
			overallHealthy = false
			healthErrors = append(healthErrors, fmt.Sprintf("Service %s: %s", ep.Service, healthStatus.Message))
			log.Info("Service unhealthy", "service", ep.Service, "message", healthStatus.Message)
		}
		m.discovery.UpdateHealthStatus(tenant.Name, ep.Service, healthStatus)
	}

	// Check database health with better error handling
	dbHealthy, err := m.checkDatabaseHealth(ctx, tenant)
	if err != nil {
		log.Info("Database health check failed", "error", err.Error())
		healthErrors = append(healthErrors, fmt.Sprintf("Database: %s", err.Error()))
		overallHealthy = false
	}
	tenantHealth.WithLabelValues(tenant.Name, "database").Set(boolToFloat64(dbHealthy))

	// Return aggregated error if there are health issues
	if len(healthErrors) > 0 {
		return overallHealthy, fmt.Errorf("health issues detected: %v", healthErrors)
	}

	return overallHealthy, nil
}

// checkDatabaseHealth performs a health check on the tenant's database
func (m *Monitor) checkDatabaseHealth(ctx context.Context, tenant *tenantv1alpha1.Tenant) (bool, error) {
	log := log.FromContext(ctx).WithValues("tenant", tenant.Name)
	
	statefulSet := &appsv1.StatefulSet{}
	err := m.client.Get(ctx, types.NamespacedName{
		Name:      fmt.Sprintf("%s-db", tenant.Name),
		Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
	}, statefulSet)
	
	if err != nil {
		if errors.IsNotFound(err) {
			log.Info("Database StatefulSet not found, may still be creating")
			return false, fmt.Errorf("database StatefulSet not found")
		}
		log.Error(err, "Failed to get database StatefulSet")
		return false, fmt.Errorf("failed to get database StatefulSet: %w", err)
	}

	// Check if StatefulSet is ready
	if statefulSet.Status.ReadyReplicas == 0 {
		// More detailed status checking
		if statefulSet.Status.Replicas == 0 {
			log.Info("Database StatefulSet has no replicas yet")
			return false, fmt.Errorf("database StatefulSet has no replicas")
		}
		
		if statefulSet.Status.CurrentReplicas > 0 && statefulSet.Status.ReadyReplicas == 0 {
			log.Info("Database StatefulSet replicas are starting but not ready yet", 
				"current", statefulSet.Status.CurrentReplicas, 
				"ready", statefulSet.Status.ReadyReplicas)
			return false, fmt.Errorf("database replicas are starting but not ready yet")
		}
		
		log.Info("Database StatefulSet has no ready replicas", 
			"replicas", statefulSet.Status.Replicas,
			"currentReplicas", statefulSet.Status.CurrentReplicas,
			"readyReplicas", statefulSet.Status.ReadyReplicas)
		return false, fmt.Errorf("database StatefulSet has no ready replicas")
	}

	log.Info("Database health check passed", 
		"readyReplicas", statefulSet.Status.ReadyReplicas,
		"totalReplicas", statefulSet.Status.Replicas)
	return true, nil
}

// boolToFloat64 converts a boolean to a Prometheus-compatible float64
func boolToFloat64(b bool) float64 {
	if b {
		return 1.0
	}
	return 0.0
}