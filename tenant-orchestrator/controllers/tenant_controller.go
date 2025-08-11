package controllers

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	tenantv1alpha1 "github.com/grg-automation/multi-saas-crm/tenant-orchestrator/api/v1alpha1"
	"github.com/grg-automation/multi-saas-crm/tenant-orchestrator/pkg/discovery"
	"github.com/grg-automation/multi-saas-crm/tenant-orchestrator/pkg/health"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	networkingv1 "k8s.io/api/networking/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/client-go/tools/record"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/log"
	"sigs.k8s.io/controller-runtime/pkg/predicate"
)

const (
	tenantFinalizer = "tenant.grg-automation.com/finalizer"
	ownerKey        = ".metadata.controller"
	apiVersion      = "tenant.grg-automation.com/v1alpha1"
	authServiceURL  = "http://localhost:3002/api/v1/tenants/ready" // Mock AuthService endpoint
)

// TenantReconciler reconciles a Tenant object
type TenantReconciler struct {
	client.Client
	Scheme        *runtime.Scheme
	Discovery     *discovery.Client
	HealthMonitor *health.Monitor
	EventRecorder record.EventRecorder
}

// Reconcile the Tenant resource
func (r *TenantReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := log.FromContext(ctx).WithValues("tenant", req.NamespacedName)
	log.Info("Reconciling Tenant", "time", "01:47 AM +05, Tuesday, August 12, 2025")

	tenant := &tenantv1alpha1.Tenant{}
	if err := r.Get(ctx, req.NamespacedName, tenant); err != nil {
		if errors.IsNotFound(err) {
			log.Info("Tenant resource not found. Ignoring since object must be deleted")
			return ctrl.Result{}, nil
		}
		log.Error(err, "Failed to get Tenant")
		return ctrl.Result{}, err
	}

	if !tenant.ObjectMeta.DeletionTimestamp.IsZero() {
		return r.handleDeletion(ctx, tenant)
	}

	if !controllerutil.ContainsFinalizer(tenant, tenantFinalizer) {
		controllerutil.AddFinalizer(tenant, tenantFinalizer)
		if err := r.Update(ctx, tenant); err != nil {
			log.Error(err, "Failed to add finalizer")
			return ctrl.Result{}, err
		}
	}

	result, err := r.reconcileTenant(ctx, tenant)
	if err != nil {
		r.EventRecorder.Event(tenant, corev1.EventTypeWarning, "ReconcileError", err.Error())
		return result, err
	}

	tenant.Status.LastReconciled = &metav1.Time{Time: time.Now()}
	if err := r.Status().Update(ctx, tenant); err != nil {
		log.Error(err, "Failed to update Tenant status")
		return ctrl.Result{}, err
	}
	return result, nil
}

// Reconcile tenant resources
func (r *TenantReconciler) reconcileTenant(ctx context.Context, tenant *tenantv1alpha1.Tenant) (ctrl.Result, error) {
	log := log.FromContext(ctx).WithValues("tenant", tenant.Name)
	tenantId := tenant.Name // Use CRD name as tenantId for URL-based routing

	if tenant.Status.Phase == "" || tenant.Status.Phase == "Pending" {
		tenant.Status.Phase = "Provisioning"
		r.EventRecorder.Event(tenant, corev1.EventTypeNormal, "Provisioning", "Starting tenant provisioning at 01:47 AM +05, Tuesday, August 12, 2025")
	}

	if err := r.ensureNamespace(ctx, tenant); err != nil {
		log.Error(err, "Failed to ensure namespace")
		return ctrl.Result{}, err
	}

	if err := r.reconcileDatabase(ctx, tenant); err != nil {
		meta.SetStatusCondition(&tenant.Status.Conditions, metav1.Condition{
			Type:    "DatabaseReady",
			Status:  metav1.ConditionFalse,
			Reason:  "DatabaseError",
			Message: err.Error(),
		})
		return ctrl.Result{RequeueAfter: 30 * time.Second}, err
	}

	for _, svc := range tenant.Spec.Services {
		if err := r.reconcileService(ctx, tenant, svc); err != nil {
			log.Error(err, "Failed to reconcile service", "service", svc.Name)
			return ctrl.Result{RequeueAfter: 30 * time.Second}, err
		}
	}

	if tenant.Spec.Database.Backup.Enabled {
		if err := r.reconcileBackup(ctx, tenant); err != nil {
			meta.SetStatusCondition(&tenant.Status.Conditions, metav1.Condition{
				Type:    "BackupReady",
				Status:  metav1.ConditionFalse,
				Reason:  "BackupError",
				Message: err.Error(),
			})
			return ctrl.Result{RequeueAfter: 30 * time.Second}, err
		}
		meta.SetStatusCondition(&tenant.Status.Conditions, metav1.Condition{
			Type:    "BackupReady",
			Status:  metav1.ConditionTrue,
			Reason:  "BackupProvisioned",
			Message: "Backups are configured",
		})
	}

	tenant.Status.URL = fmt.Sprintf("https://mysite/%s/api", tenantId)
	if err := r.reconcileIngress(ctx, tenant); err != nil {
		log.Error(err, "Failed to reconcile ingress")
		return ctrl.Result{RequeueAfter: 30 * time.Second}, err
	}

	healthy, err := r.HealthMonitor.CheckTenantHealth(ctx, tenant)
	if err != nil {
		log.Error(err, "Health check failed")
		return ctrl.Result{RequeueAfter: 1 * time.Minute}, nil
	}
	if healthy {
		tenant.Status.Phase = "Active"
		r.EventRecorder.Event(tenant, corev1.EventTypeNormal, "Active", "Tenant is active and healthy at 01:47 AM +05, Tuesday, August 12, 2025")
		if err := r.notifyTenantReady(ctx, tenant); err != nil {
			log.Error(err, "Failed to notify tenant readiness")
		}
	}

	if err := r.Discovery.UpdateServiceEndpoints(ctx, tenant); err != nil {
		log.Error(err, "Failed to update service discovery")
	}

	return ctrl.Result{RequeueAfter: 5 * time.Minute}, nil
}

// Ensure namespace exists
func (r *TenantReconciler) ensureNamespace(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	log := log.FromContext(ctx)
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: fmt.Sprintf("tenant-%s", tenant.Name),
			Labels: map[string]string{
				"tenant.rezenkai.com/name": tenant.Name,
				"tenant.rezenkai.com/tier": tenant.Spec.Tier,
			},
		},
	}
	if err := r.Create(ctx, ns); err != nil && !errors.IsAlreadyExists(err) {
		log.Error(err, "Failed to create namespace")
		return err
	}
	return nil
}

// Reconcile database resources
func (r *TenantReconciler) reconcileDatabase(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	log := log.FromContext(ctx)
	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-db-credentials", tenant.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"username": []byte(fmt.Sprintf("tenant_%s", tenant.Name)),
			"password": []byte("SecurePassword123!"), // Replace with secure generation
			"database": []byte(fmt.Sprintf("tenant_%s_db", tenant.Name)),
		},
	}
	if err := controllerutil.SetControllerReference(tenant, secret, r.Scheme); err != nil {
		return err
	}
	if err := r.Create(ctx, secret); err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	statefulSet := r.databaseStatefulSet(tenant)
	if err := controllerutil.SetControllerReference(tenant, statefulSet, r.Scheme); err != nil {
		return err
	}
	if err := r.Create(ctx, statefulSet); err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	tenant.Status.DatabaseStatus.ConnectionURL = fmt.Sprintf("%s-db-svc.tenant-%s.svc.cluster.local:5432/%s", tenant.Name, tenant.Name, fmt.Sprintf("tenant_%s_db", tenant.Name))
	meta.SetStatusCondition(&tenant.Status.Conditions, metav1.Condition{
		Type:    "DatabaseReady",
		Status:  metav1.ConditionTrue,
		Reason:  "DatabaseProvisioned",
		Message: "Database is provisioned and ready",
	})
	return nil
}

// Reconcile service deployment
func (r *TenantReconciler) reconcileService(ctx context.Context, tenant *tenantv1alpha1.Tenant, svc tenantv1alpha1.ServiceSpec) error {
	log := log.FromContext(ctx)
	deployment := r.serviceDeployment(tenant, svc)
	if err := controllerutil.SetControllerReference(tenant, deployment, r.Scheme); err != nil {
		return err
	}
	if err := r.Create(ctx, deployment); err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	service := r.kubernetesService(tenant, svc)
	if err := controllerutil.SetControllerReference(tenant, service, r.Scheme); err != nil {
		return err
	}
	if err := r.Create(ctx, service); err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

// Reconcile backup job
func (r *TenantReconciler) reconcileBackup(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	// Stub: Implement backup job creation
	return nil
}

// Reconcile ingress
func (r *TenantReconciler) reconcileIngress(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	ingress := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-ingress", tenant.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
		},
	}
	if err := controllerutil.SetControllerReference(tenant, ingress, r.Scheme); err != nil {
		return err
	}
	if err := r.Create(ctx, ingress); err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

// Handle tenant deletion
func (r *TenantReconciler) handleDeletion(ctx context.Context, tenant *tenantv1alpha1.Tenant) (ctrl.Result, error) {
	log := log.FromContext(ctx)
	if controllerutil.ContainsFinalizer(tenant, tenantFinalizer) {
		tenant.Status.Phase = "Terminating"
		r.EventRecorder.Event(tenant, corev1.EventTypeNormal, "Terminating", "Starting tenant termination")

		if err := r.cleanupTenantResources(ctx, tenant); err != nil {
			log.Error(err, "Failed to clean up tenant resources")
			return ctrl.Result{}, err
		}

		controllerutil.RemoveFinalizer(tenant, tenantFinalizer)
		if err := r.Update(ctx, tenant); err != nil {
			return ctrl.Result{}, err
		}
	}
	return ctrl.Result{}, nil
}

// Clean up tenant resources
func (r *TenantReconciler) cleanupTenantResources(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	log := log.FromContext(ctx)
	if err := r.Discovery.RemoveTenant(ctx, tenant); err != nil {
		log.Error(err, "Failed to remove tenant from service discovery")
	}
	return nil
}

// Notify AuthService of tenant readiness via HTTP POST
func (r *TenantReconciler) notifyTenantReady(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	log := log.FromContext(ctx).WithValues("tenant", tenant.Name)
	log.Info("Notifying tenant readiness via HTTP POST", "tenantId", tenant.Name)

	// Prepare the HTTP request
	req, err := http.NewRequestWithContext(ctx, "POST", authServiceURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create HTTP request: %v", err)
	}

	// Add tenantId in the body or headers (example with JSON body)
	req.Header.Set("Content-Type", "application/json")
	payload := fmt.Sprintf(`{"tenantId": "%s", "status": "ready"}`, tenant.Name)
	req.Body = io.NopCloser(strings.NewReader(payload))

	// Make the HTTP request
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to notify AuthService: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("unexpected status code from AuthService: %d", resp.StatusCode)
	}

	log.Info("Successfully notified AuthService", "tenantId", tenant.Name)
	return nil
}

// Helper: Database StatefulSet
func (r *TenantReconciler) databaseStatefulSet(tenant *tenantv1alpha1.Tenant) *appsv1.StatefulSet {
	replicas := int32(1)
	labels := map[string]string{
		"app":    "postgres",
		"tenant": tenant.Name,
	}
	return &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-db", tenant.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
		},
		Spec: appsv1.StatefulSetSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: "postgres"}}},
			},
		},
	}
}

// Helper: Service Deployment
func (r *TenantReconciler) serviceDeployment(tenant *tenantv1alpha1.Tenant, svc tenantv1alpha1.ServiceSpec) *appsv1.Deployment {
	labels := map[string]string{
		"app":     svc.Name,
		"tenant":  tenant.Name,
		"version": svc.Version,
	}
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-%s", tenant.Name, svc.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &svc.Replicas,
			Selector: &metav1.LabelSelector{MatchLabels: labels},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec:       corev1.PodSpec{Containers: []corev1.Container{{Name: svc.Name}}},
			},
		},
	}
}

// Helper: Kubernetes Service
func (r *TenantReconciler) kubernetesService(tenant *tenantv1alpha1.Tenant, svc tenantv1alpha1.ServiceSpec) *corev1.Service {
	labels := map[string]string{
		"app":    svc.Name,
		"tenant": tenant.Name,
	}
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-%s-svc", tenant.Name, svc.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
		},
		Spec: corev1.ServiceSpec{
			Selector: labels,
			Ports:    []corev1.ServicePort{{Port: 80}},
		},
	}
}

func (r *TenantReconciler) SetupWithManager(mgr ctrl.Manager) error {
	if err := mgr.GetFieldIndexer().IndexField(context.Background(), &appsv1.Deployment{}, ownerKey, func(rawObj client.Object) []string {
		deployment := rawObj.(*appsv1.Deployment)
		owner := metav1.GetControllerOf(deployment)
		if owner == nil || owner.APIVersion != apiVersion || owner.Kind != "Tenant" {
			return nil
		}
		return []string{owner.Name}
	}); err != nil {
		return err
	}
	return ctrl.NewControllerManagedBy(mgr).
		For(&tenantv1alpha1.Tenant{}).
		Owns(&appsv1.Deployment{}).
		Owns(&appsv1.StatefulSet{}).
		Owns(&corev1.Service{}).
		Owns(&networkingv1.Ingress{}).
		Owns(&batchv1.Job{}).
		WithEventFilter(predicate.GenerationChangedPredicate{}).
		Complete(r)
}