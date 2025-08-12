package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gorilla/mux"
	tenantv1alpha1 "github.com/grg-automation/multi-saas-crm/tenant-orchestrator/api/v1alpha1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	utilruntime "k8s.io/apimachinery/pkg/util/runtime"
	clientgoscheme "k8s.io/client-go/kubernetes/scheme"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

var (
	scheme = runtime.NewScheme()
	k8sClient client.Client
)

func init() {
	utilruntime.Must(clientgoscheme.AddToScheme(scheme))
	utilruntime.Must(tenantv1alpha1.AddToScheme(scheme))
}

// TenantCreateRequest represents the request to create a tenant
type TenantCreateRequest struct {
	Name             string            `json:"name"`
	OrganizationName string            `json:"organizationName"`
	Tier             string            `json:"tier"`
	Resources        ResourceSpec      `json:"resources"`
	Services         []ServiceSpec     `json:"services"`
	Database         DatabaseSpec      `json:"database"`
	Domains          []string          `json:"domains,omitempty"`
	Features         map[string]bool   `json:"features,omitempty"`
	Metadata         map[string]string `json:"metadata,omitempty"`
}

type ResourceSpec struct {
	CPU     ResourceQuantity `json:"cpu"`
	Memory  ResourceQuantity `json:"memory"`
	Storage StorageSpec      `json:"storage"`
}

type ResourceQuantity struct {
	Request string `json:"request"`
	Limit   string `json:"limit"`
}

type StorageSpec struct {
	Size         string `json:"size"`
	StorageClass string `json:"storageClass,omitempty"`
}

type ServiceSpec struct {
	Name     string `json:"name"`
	Version  string `json:"version"`
	Replicas int32  `json:"replicas"`
}

type DatabaseSpec struct {
	Type    string `json:"type"`
	Version string `json:"version"`
}

// TenantResponse represents the response after tenant creation
type TenantResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
	Message string      `json:"message,omitempty"`
}

func main() {
	log.Println("Starting Tenant Orchestrator HTTP API Server...")

	// Initialize Kubernetes client
	config := ctrl.GetConfigOrDie()
	var err error
	k8sClient, err = client.New(config, client.Options{Scheme: scheme})
	if err != nil {
		log.Fatalf("Failed to create Kubernetes client: %v", err)
	}

	// Setup HTTP routes
	r := mux.NewRouter()
	
	// Health check
	r.HandleFunc("/health", healthHandler).Methods("GET")
	r.HandleFunc("/api/v1/health", healthHandler).Methods("GET")
	
	// Tenant management
	r.HandleFunc("/api/v1/tenants", createTenantHandler).Methods("POST")
	r.HandleFunc("/api/v1/tenants/{name}", getTenantHandler).Methods("GET")
	r.HandleFunc("/api/v1/tenants/{name}", deleteTenantHandler).Methods("DELETE")
	r.HandleFunc("/api/v1/tenants", listTenantsHandler).Methods("GET")

	// CORS middleware
	r.Use(corsMiddleware)
	r.Use(loggingMiddleware)

	// Используем порт 8015 вместо 8080
	port := os.Getenv("PORT")
	if port == "" {
		port = "8015" // Изменили с 8080 на 8015
	}

	log.Printf("🚀 Tenant Orchestrator HTTP API running on port %s", port)
	log.Printf("📝 Health check: http://localhost:%s/health", port)
	log.Printf("🏢 Tenants API: http://localhost:%s/api/v1/tenants", port)
	
	log.Fatal(http.ListenAndServe(":"+port, r))
}

// Health check handler
func healthHandler(w http.ResponseWriter, r *http.Request) {
	response := TenantResponse{
		Success: true,
		Data: map[string]interface{}{
			"status":    "healthy",
			"service":   "tenant-orchestrator",
			"timestamp": time.Now().UTC().Format(time.RFC3339),
			"version":   "1.0.0",
		},
		Message: "Tenant Orchestrator is running",
	}
	writeJSONResponse(w, http.StatusOK, response)
}

// Create tenant handler
func createTenantHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("📥 Creating tenant - Method: %s, URL: %s", r.Method, r.URL.Path)
	
	var req TenantCreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		log.Printf("❌ Failed to decode request: %v", err)
		writeErrorResponse(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	log.Printf("📋 Tenant creation request: %+v", req)

	// Create Kubernetes Tenant resource
	tenant := &tenantv1alpha1.Tenant{
		ObjectMeta: metav1.ObjectMeta{
			Name:      req.Name,
			Namespace: "default",
			Labels: map[string]string{
				"tenant.rezenkai.com/name": req.Name,
				"tenant.rezenkai.com/tier": req.Tier,
			},
		},
		Spec: tenantv1alpha1.TenantSpec{
			OrganizationName: req.OrganizationName,
			Tier:             req.Tier,
			Resources: tenantv1alpha1.ResourceSpec{
				CPU: tenantv1alpha1.ResourceQuantity{
					Request: req.Resources.CPU.Request,
					Limit:   req.Resources.CPU.Limit,
				},
				Memory: tenantv1alpha1.ResourceQuantity{
					Request: req.Resources.Memory.Request,
					Limit:   req.Resources.Memory.Limit,
				},
				Storage: tenantv1alpha1.StorageSpec{
					Size:         req.Resources.Storage.Size,
					StorageClass: req.Resources.Storage.StorageClass,
				},
			},
			Services: convertServices(req.Services),
			Database: tenantv1alpha1.DatabaseSpec{
				Type:    req.Database.Type,
				Version: req.Database.Version,
				Backup: tenantv1alpha1.BackupSpec{
					Enabled: false, // Default for now
				},
			},
			Domains:  req.Domains,
			Features: req.Features,
		},
	}

	// Create the tenant in Kubernetes
	ctx := context.Background()
	if err := k8sClient.Create(ctx, tenant); err != nil {
		log.Printf("❌ Failed to create tenant in Kubernetes: %v", err)
		writeErrorResponse(w, http.StatusInternalServerError, fmt.Sprintf("Failed to create tenant: %v", err))
		return
	}

	log.Printf("✅ Tenant %s created successfully in Kubernetes", req.Name)

	response := TenantResponse{
		Success: true,
		Data: map[string]interface{}{
			"name":             req.Name,
			"organizationName": req.OrganizationName,
			"tier":             req.Tier,
			"status":           "Creating",
			"message":          "Tenant creation initiated",
		},
		Message: fmt.Sprintf("Tenant %s created successfully", req.Name),
	}

	writeJSONResponse(w, http.StatusCreated, response)
}

// Get tenant handler
func getTenantHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]

	log.Printf("📖 Getting tenant: %s", name)

	tenant := &tenantv1alpha1.Tenant{}
	ctx := context.Background()
	
	if err := k8sClient.Get(ctx, client.ObjectKey{Name: name, Namespace: "default"}, tenant); err != nil {
		log.Printf("❌ Failed to get tenant %s: %v", name, err)
		writeErrorResponse(w, http.StatusNotFound, fmt.Sprintf("Tenant %s not found", name))
		return
	}

	response := TenantResponse{
		Success: true,
		Data:    tenant,
		Message: fmt.Sprintf("Tenant %s retrieved successfully", name),
	}

	writeJSONResponse(w, http.StatusOK, response)
}

// Delete tenant handler
func deleteTenantHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	name := vars["name"]

	log.Printf("🗑️ Deleting tenant: %s", name)

	tenant := &tenantv1alpha1.Tenant{
		ObjectMeta: metav1.ObjectMeta{
			Name:      name,
			Namespace: "default",
		},
	}

	ctx := context.Background()
	if err := k8sClient.Delete(ctx, tenant); err != nil {
		log.Printf("❌ Failed to delete tenant %s: %v", name, err)
		writeErrorResponse(w, http.StatusInternalServerError, fmt.Sprintf("Failed to delete tenant: %v", err))
		return
	}

	log.Printf("✅ Tenant %s deletion initiated", name)

	response := TenantResponse{
		Success: true,
		Message: fmt.Sprintf("Tenant %s deletion initiated", name),
	}

	writeJSONResponse(w, http.StatusOK, response)
}

// List tenants handler
func listTenantsHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("📋 Listing all tenants")

	tenantList := &tenantv1alpha1.TenantList{}
	ctx := context.Background()
	
	if err := k8sClient.List(ctx, tenantList); err != nil {
		log.Printf("❌ Failed to list tenants: %v", err)
		writeErrorResponse(w, http.StatusInternalServerError, "Failed to list tenants")
		return
	}

	response := TenantResponse{
		Success: true,
		Data:    tenantList.Items,
		Message: fmt.Sprintf("Found %d tenants", len(tenantList.Items)),
	}

	writeJSONResponse(w, http.StatusOK, response)
}

// Helper functions
func convertServices(services []ServiceSpec) []tenantv1alpha1.ServiceSpec {
	result := make([]tenantv1alpha1.ServiceSpec, len(services))
	for i, svc := range services {
		result[i] = tenantv1alpha1.ServiceSpec{
			Name:     svc.Name,
			Version:  svc.Version,
			Replicas: svc.Replicas,
		}
	}
	return result
}

func writeJSONResponse(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func writeErrorResponse(w http.ResponseWriter, status int, message string) {
	response := TenantResponse{
		Success: false,
		Error:   message,
	}
	writeJSONResponse(w, status, response)
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-User-Role, X-Tenant-ID")
		
		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}
		
		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		log.Printf("📡 %s %s - %v", r.Method, r.URL.Path, time.Since(start))
	})
}