package controllers

import (
	"context"
	"fmt"
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
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/util/intstr"
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
	authServiceURL  = "http://localhost:3002/api/v1/tenants/ready"
)

// TenantReconciler reconciles a Tenant object
type TenantReconciler struct {
	client.Client
	Scheme        *runtime.Scheme
	Discovery     *discovery.Client
	HealthMonitor *health.Monitor
	EventRecorder record.EventRecorder
}

// Reconcile the Tenant resource with improved error handling
func (r *TenantReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := log.FromContext(ctx)

	// Fetch the Tenant instance
	var tenant tenantv1alpha1.Tenant
	if err := r.Get(ctx, req.NamespacedName, &tenant); err != nil {
		log.Error(err, "unable to fetch Tenant")
		return ctrl.Result{}, client.IgnoreNotFound(err)
	}

	// Initialize status.phase if not set
	if tenant.Status.Phase == "" {
		tenant.Status.Phase = "Pending"
		if err := r.Status().Update(ctx, &tenant); err != nil {
			if errors.IsConflict(err) || errors.IsNotFound(err) {
				log.Info("conflict or not found during initial status update, requeuing")
				return ctrl.Result{Requeue: true}, nil
			}
			log.Error(err, "failed to update Tenant status")
			return ctrl.Result{}, err
		}
		return ctrl.Result{Requeue: true}, nil
	}

	// Handle deletion
	if !tenant.ObjectMeta.DeletionTimestamp.IsZero() {
		return r.handleDeletion(ctx, &tenant)
	}

	// Add finalizer if not present
	if !controllerutil.ContainsFinalizer(&tenant, tenantFinalizer) {
		controllerutil.AddFinalizer(&tenant, tenantFinalizer)
		if err := r.Update(ctx, &tenant); err != nil {
			log.Error(err, "failed to add finalizer")
			return ctrl.Result{Requeue: true}, err
		}
		return ctrl.Result{Requeue: true}, nil
	}

	// Perform tenant reconciliation
	result, err := r.reconcileTenant(ctx, &tenant)
	if err != nil {
		r.EventRecorder.Event(&tenant, corev1.EventTypeWarning, "ReconcileError", err.Error())
		
		// Update status to reflect error
		tenant.Status.Phase = "Failed"
		meta.SetStatusCondition(&tenant.Status.Conditions, metav1.Condition{
			Type:    "Ready",
			Status:  metav1.ConditionFalse,
			Reason:  "ReconcileError",
			Message: err.Error(),
		})
		
		if statusErr := r.Status().Update(ctx, &tenant); statusErr != nil {
			log.Error(statusErr, "failed to update error status")
		}
		
		return result, err
	}

	// Update last reconciled time
	tenant.Status.LastReconciled = &metav1.Time{Time: time.Now()}
	if err := r.updateStatusWithRetry(ctx, &tenant); err != nil {
		log.Error(err, "failed to update status after successful reconciliation")
		return ctrl.Result{Requeue: true}, err
	}

	return result, nil
}

// updateStatusWithRetry handles status updates with conflict resolution
func (r *TenantReconciler) updateStatusWithRetry(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	log := log.FromContext(ctx)
	
	for i := 0; i < 3; i++ {
		if err := r.Status().Update(ctx, tenant); err != nil {
			if errors.IsConflict(err) {
				log.Info("conflict during status update, retrying", "attempt", i+1)
				time.Sleep(time.Duration(i+1) * time.Second)
				
				// Re-fetch the latest version
				if fetchErr := r.Get(ctx, client.ObjectKeyFromObject(tenant), tenant); fetchErr != nil {
					return fetchErr
				}
				continue
			}
			return err
		}
		return nil
	}
	return fmt.Errorf("failed to update status after 3 attempts")
}

func (r *TenantReconciler) reconcileBackup(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	log := log.FromContext(ctx).WithValues("tenant", tenant.Name)
	
	// TODO: Implement backup job creation
	// For now, just log that backup is being set up
	log.Info("Setting up backup configuration", "tenant", tenant.Name)
	
	// Create a simple CronJob for database backup (placeholder)
	cronJob := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-db-backup", tenant.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
			Labels: map[string]string{
				"tenant.rezenkai.com/name": tenant.Name,
				"app.kubernetes.io/managed-by": "tenant-orchestrator",
				"app.kubernetes.io/component": "backup",
			},
		},
		Spec: batchv1.CronJobSpec{
			Schedule: tenant.Spec.Database.Backup.Schedule,
			JobTemplate: batchv1.JobTemplateSpec{
				Spec: batchv1.JobSpec{
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{
							RestartPolicy: corev1.RestartPolicyOnFailure,
							Containers: []corev1.Container{
								{
									Name:  "backup",
									Image: "postgres:15", // Use same version as database
									Command: []string{
										"sh", "-c",
										"echo 'Backup placeholder - implement pg_dump here'",
									},
								},
							},
						},
					},
				},
			},
		},
	}
	
	if err := r.Create(ctx, cronJob); err != nil && !errors.IsAlreadyExists(err) {
		log.Error(err, "Failed to create backup CronJob")
		return err
	}
	
	log.Info("Backup CronJob created successfully")
	return nil
}

func (r *TenantReconciler) notifyTenantReady(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	log := log.FromContext(ctx).WithValues("tenant", tenant.Name)
	
	// TODO: Implement notification to external services
	// For now, just log that tenant is ready
	log.Info("Tenant is ready and active", 
		"tenant", tenant.Name, 
		"organization", tenant.Spec.OrganizationName,
		"url", tenant.Status.URL,
	)
	
	// You could add HTTP calls to notify other services here
	// Example:
	// - Notify billing service
	// - Notify monitoring service  
	// - Send email to tenant admin
	// - Update external registry
	
	return nil
}

// Simplified reconcileTenant
func (r *TenantReconciler) reconcileTenant(ctx context.Context, tenant *tenantv1alpha1.Tenant) (ctrl.Result, error) {
	log := log.FromContext(ctx).WithValues("tenant", tenant.Name)
	tenantId := tenant.Name

	if tenant.Status.Phase == "" || tenant.Status.Phase == "Pending" {
		tenant.Status.Phase = "Provisioning"
		r.EventRecorder.Event(tenant, corev1.EventTypeNormal, "Provisioning", "Starting tenant provisioning")
	}

	if err := r.ensureNamespace(ctx, tenant); err != nil {
		log.Error(err, "Failed to ensure namespace")
		return ctrl.Result{}, err
	}

	if err := r.reconcileDatabase(ctx, tenant); err != nil {
		meta.SetStatusCondition(&tenant.Status.Conditions, metav1.Condition{
			Type:    "DatabaseReady",
			Status:  metav1.ConditionFalse, // This resolves to "False"
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
				Status:  metav1.ConditionFalse, // This resolves to "False"
				Reason:  "BackupError",
				Message: err.Error(),
			})
			return ctrl.Result{RequeueAfter: 30 * time.Second}, err
		}
		meta.SetStatusCondition(&tenant.Status.Conditions, metav1.Condition{
			Type:    "BackupReady",
			Status:  metav1.ConditionTrue, // This resolves to "True"
			Reason:  "BackupProvisioned",
			Message: "Backups are configured",
		})
	}

	tenant.Status.URL = fmt.Sprintf("https://mysite/%s/api", tenantId)
	if err := r.reconcileIngress(ctx, tenant); err != nil {
		log.Error(err, "Failed to reconcile ingress")
		return ctrl.Result{RequeueAfter: 30 * time.Second}, err
	}

	// Check health but don't fail if database isn't ready yet
	healthy, err := r.HealthMonitor.CheckTenantHealth(ctx, tenant)
	if err != nil {
		log.Info("Health check reported issues, will retry", "error", err.Error())
		// Don't return error, just continue and retry later
	}

	if healthy {
		tenant.Status.Phase = "Active"
		meta.SetStatusCondition(&tenant.Status.Conditions, metav1.Condition{
			Type:    "Ready",
			Status:  metav1.ConditionTrue, // This resolves to "True"
			Reason:  "TenantActive",
			Message: "Tenant is active and healthy",
		})
		r.EventRecorder.Event(tenant, corev1.EventTypeNormal, "Active", "Tenant is active and healthy")
		if err := r.notifyTenantReady(ctx, tenant); err != nil {
			log.Error(err, "Failed to notify tenant readiness")
		}
	} else {
		meta.SetStatusCondition(&tenant.Status.Conditions, metav1.Condition{
			Type:    "Ready",
			Status:  metav1.ConditionFalse, // This resolves to "False"
			Reason:  "TenantNotReady",
			Message: "Tenant services are not ready yet",
		})
	}

	// Update service discovery (with proper error handling)
	if err := r.Discovery.UpdateServiceEndpoints(ctx, tenant); err != nil {
		log.Error(err, "Failed to update service discovery")
		// Don't fail the reconciliation for discovery errors
	}

	return ctrl.Result{RequeueAfter: 5 * time.Minute}, nil
}

// Simplified ensureNamespace
func (r *TenantReconciler) ensureNamespace(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	namespaceName := fmt.Sprintf("tenant-%s", tenant.Name)
	
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: namespaceName,
			Labels: map[string]string{
				"tenant.grg-automation.com/name": tenant.Name,
				"tenant.grg-automation.com/tier": tenant.Spec.Tier,
			},
		},
	}

	if err := r.Create(ctx, ns); err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	// Basic resource quota
	quota := &corev1.ResourceQuota{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-quota", tenant.Name),
			Namespace: namespaceName,
		},
		Spec: corev1.ResourceQuotaSpec{
			Hard: corev1.ResourceList{
				corev1.ResourceCPU:    resource.MustParse(tenant.Spec.Resources.CPU.Limit),
				corev1.ResourceMemory: resource.MustParse(tenant.Spec.Resources.Memory.Limit),
				corev1.ResourcePods:   resource.MustParse("50"),
			},
		},
	}

	if err := r.Create(ctx, quota); err != nil && !errors.IsAlreadyExists(err) {
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
	// Delete the tenant namespace (this will delete all resources in it)
	ns := &corev1.Namespace{
		ObjectMeta: metav1.ObjectMeta{
			Name: fmt.Sprintf("tenant-%s", tenant.Name),
		},
	}
	
	if err := r.Delete(ctx, ns); err != nil && !errors.IsNotFound(err) {
		return err
	}
	
	return nil
}

func (r *TenantReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&tenantv1alpha1.Tenant{}).
		WithEventFilter(predicate.GenerationChangedPredicate{}).
		Complete(r)
}

func (r *TenantReconciler) reconcileDatabase(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	// Create database service first
	dbService := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-db-svc", tenant.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
			Labels: map[string]string{
				"tenant.rezenkai.com/name": tenant.Name,
				"app.kubernetes.io/managed-by": "tenant-orchestrator",
				"app.kubernetes.io/part-of": "tenant-infrastructure",
				"app.kubernetes.io/component": "database",
			},
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": "postgres", "tenant": tenant.Name},
			Ports: []corev1.ServicePort{
				{
					Port:       5432,
					TargetPort: intstr.FromInt(5432),
					Protocol:   corev1.ProtocolTCP,
				},
			},
		},
	}

	if err := r.Create(ctx, dbService); err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	secret := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-db-credentials", tenant.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
			Labels: map[string]string{
				"tenant.rezenkai.com/name": tenant.Name,
				"app.kubernetes.io/managed-by": "tenant-orchestrator",
				"app.kubernetes.io/part-of": "tenant-infrastructure",
			},
		},
		Type: corev1.SecretTypeOpaque,
		Data: map[string][]byte{
			"username": []byte(fmt.Sprintf("tenant_%s", tenant.Name)),
			"password": []byte("SecurePassword123!"),
			"database": []byte(fmt.Sprintf("tenant_%s_db", tenant.Name)),
		},
	}

	if err := r.Create(ctx, secret); err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	statefulSet := r.databaseStatefulSet(tenant)
	if err := r.Create(ctx, statefulSet); err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	tenant.Status.DatabaseStatus.ConnectionURL = fmt.Sprintf("%s-db-svc.tenant-%s.svc.cluster.local:5432/%s", tenant.Name, tenant.Name, fmt.Sprintf("tenant_%s_db", tenant.Name))
	
	// FIXED: Use the actual Kubernetes constants that resolve to proper capitalized strings
	meta.SetStatusCondition(&tenant.Status.Conditions, metav1.Condition{
		Type:    "DatabaseReady",
		Status:  metav1.ConditionTrue, // This resolves to "True"
		Reason:  "DatabaseProvisioned",
		Message: "Database is provisioned and ready",
	})
	return nil
}

// Updated reconcileService method
func (r *TenantReconciler) reconcileService(ctx context.Context, tenant *tenantv1alpha1.Tenant, svc tenantv1alpha1.ServiceSpec) error {
    log := log.FromContext(ctx)
    deployment := r.serviceDeployment(tenant, svc)
    // Remove cross-namespace owner reference
    // if err := controllerutil.SetControllerReference(tenant, deployment, r.Scheme); err != nil {
    //     log.Error(err, "Failed to set controller reference for deployment", "service", svc.Name)
    //     return err
    // }
    if err := r.Create(ctx, deployment); err != nil && !errors.IsAlreadyExists(err) {
        log.Error(err, "Failed to create deployment", "service", svc.Name)
        return err
    }
    
    service := r.kubernetesService(tenant, svc)
    // Remove cross-namespace owner reference
    // if err := controllerutil.SetControllerReference(tenant, service, r.Scheme); err != nil {
    //     log.Error(err, "Failed to set controller reference for service", "service", svc.Name)
    //     return err
    // }
    if err := r.Create(ctx, service); err != nil && !errors.IsAlreadyExists(err) {
        log.Error(err, "Failed to create service", "service", svc.Name)
        return err
    }
    log.Info("Successfully reconciled service", "service", svc.Name)
    return nil
}

// Updated reconcileIngress method
func (r *TenantReconciler) reconcileIngress(ctx context.Context, tenant *tenantv1alpha1.Tenant) error {
	pathType := networkingv1.PathTypePrefix
	
	ingress := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-ingress", tenant.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
			Labels: map[string]string{
				"tenant.rezenkai.com/name": tenant.Name,
				"app.kubernetes.io/managed-by": "tenant-orchestrator",
				"app.kubernetes.io/part-of": "tenant-infrastructure",
			},
		},
		Spec: networkingv1.IngressSpec{
			// ИСПРАВЛЕНО: Добавляем rules вместо пустого spec
			Rules: []networkingv1.IngressRule{
				{
					Host: fmt.Sprintf("%s.example.com", tenant.Name), // или используйте домен из tenant.Spec.Domains
					IngressRuleValue: networkingv1.IngressRuleValue{
						HTTP: &networkingv1.HTTPIngressRuleValue{
							Paths: []networkingv1.HTTPIngressPath{
								{
									Path:     "/",
									PathType: &pathType,
									Backend: networkingv1.IngressBackend{
										Service: &networkingv1.IngressServiceBackend{
											Name: fmt.Sprintf("%s-web-app-svc", tenant.Name),
											Port: networkingv1.ServiceBackendPort{
												Number: 80,
											},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}
	
	// Не устанавливаем owner reference для cross-namespace ресурсов
	if err := r.Create(ctx, ingress); err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

// Updated helper methods with proper labels
func (r *TenantReconciler) databaseStatefulSet(tenant *tenantv1alpha1.Tenant) *appsv1.StatefulSet {
	replicas := int32(1)
	labels := map[string]string{
		"app":    "postgres",
		"tenant": tenant.Name,
		"tenant.rezenkai.com/name": tenant.Name,
		"app.kubernetes.io/managed-by": "tenant-orchestrator",
		"app.kubernetes.io/part-of": "tenant-infrastructure",
		"app.kubernetes.io/component": "database",
	}
	
	return &appsv1.StatefulSet{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-db", tenant.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
			Labels:    labels,
		},
		Spec: appsv1.StatefulSetSpec{
			Replicas:    &replicas,
			ServiceName: fmt.Sprintf("%s-db-svc", tenant.Name),
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"app": "postgres", 
					"tenant": tenant.Name,
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  "postgres",
							Image: fmt.Sprintf("postgres:%s", tenant.Spec.Database.Version),
							Env: []corev1.EnvVar{
								{Name: "POSTGRES_DB", Value: fmt.Sprintf("tenant_%s_db", tenant.Name)},
								{Name: "POSTGRES_USER", Value: fmt.Sprintf("tenant_%s", tenant.Name)},
								{Name: "POSTGRES_PASSWORD", Value: "SecurePassword123!"},
								{Name: "PGDATA", Value: "/var/lib/postgresql/data/pgdata"},
							},
							Ports: []corev1.ContainerPort{
								{ContainerPort: 5432, Name: "postgres"},
							},
							VolumeMounts: []corev1.VolumeMount{
								{
									Name:      "postgres-storage",
									MountPath: "/var/lib/postgresql/data",
								},
							},
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("100m"),
									corev1.ResourceMemory: resource.MustParse("128Mi"),
								},
								Limits: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("500m"),
									corev1.ResourceMemory: resource.MustParse("512Mi"),
								},
							},
						},
					},
				},
			},
			VolumeClaimTemplates: []corev1.PersistentVolumeClaim{
				{
					ObjectMeta: metav1.ObjectMeta{
						Name: "postgres-storage",
					},
					Spec: corev1.PersistentVolumeClaimSpec{
						AccessModes: []corev1.PersistentVolumeAccessMode{
							corev1.ReadWriteOnce,
						},
						// FIXED: Use VolumeResourceRequirements instead of ResourceRequirements
						Resources: corev1.VolumeResourceRequirements{
							Requests: corev1.ResourceList{
								corev1.ResourceStorage: resource.MustParse(tenant.Spec.Resources.Storage.Size),
							},
						},
					},
				},
			},
		},
	}
}

// Updated service deployment with proper labels
// Updated service deployment with proper resource specifications
func (r *TenantReconciler) serviceDeployment(tenant *tenantv1alpha1.Tenant, svc tenantv1alpha1.ServiceSpec) *appsv1.Deployment {
	labels := map[string]string{
		"app":     svc.Name,
		"tenant":  tenant.Name,
		"version": svc.Version,
		"tenant.rezenkai.com/name": tenant.Name,
		"app.kubernetes.io/managed-by": "tenant-orchestrator",
		"app.kubernetes.io/part-of": "tenant-infrastructure",
		"app.kubernetes.io/component": "service",
	}
	
	return &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-%s", tenant.Name, svc.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
			Labels:    labels,
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &svc.Replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					"app": svc.Name, 
					"tenant": tenant.Name,
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{Labels: labels},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{
						{
							Name:  svc.Name,
							Image: fmt.Sprintf("nginx:latest"), // Default image for testing
							Env:   svc.Env,
							Ports: []corev1.ContainerPort{
								{ContainerPort: 80, Name: "http"},
							},
							// FIXED: Add resource specifications to satisfy ResourceQuota
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("50m"),   // Small request
									corev1.ResourceMemory: resource.MustParse("64Mi"),  // Small request
								},
								Limits: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("200m"),  // Within tenant limits
									corev1.ResourceMemory: resource.MustParse("256Mi"), // Within tenant limits
								},
							},
							// Add liveness and readiness probes
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/",
										Port: intstr.FromInt(80),
									},
								},
								InitialDelaySeconds: 30,
								PeriodSeconds:       10,
								TimeoutSeconds:      5,
								FailureThreshold:    3,
							},
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path: "/",
										Port: intstr.FromInt(80),
									},
								},
								InitialDelaySeconds: 5,
								PeriodSeconds:       5,
								TimeoutSeconds:      3,
								FailureThreshold:    3,
							},
						},
					},
				},
			},
		},
	}
}

// Updated kubernetes service with proper labels
func (r *TenantReconciler) kubernetesService(tenant *tenantv1alpha1.Tenant, svc tenantv1alpha1.ServiceSpec) *corev1.Service {
	labels := map[string]string{
		"app":    svc.Name,
		"tenant": tenant.Name,
		"tenant.rezenkai.com/name": tenant.Name,
		"app.kubernetes.io/managed-by": "tenant-orchestrator",
		"app.kubernetes.io/part-of": "tenant-infrastructure",
		"app.kubernetes.io/component": "service",
	}
	return &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      fmt.Sprintf("%s-%s-svc", tenant.Name, svc.Name),
			Namespace: fmt.Sprintf("tenant-%s", tenant.Name),
			Labels:    labels,
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{"app": svc.Name, "tenant": tenant.Name},
			Ports:    []corev1.ServicePort{{Port: 80, TargetPort: intstr.FromInt(80)}},
		},
	}
}