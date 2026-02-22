
#!/bin/bash
set -euo pipefail

PROJECT_ID="${GCP_PROJECT_ID:?Set GCP_PROJECT_ID}"
REGION="${GCP_REGION:-us-central1}"
SERVICE_NAME="live-agent-backend"
IMAGE="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "==> Building container image..."
gcloud builds submit --tag "${IMAGE}" --project "${PROJECT_ID}"

echo "==> Deploying to Cloud Run..."
gcloud run deploy "${SERVICE_NAME}" \
   --image "${IMAGE}" \
   --platform managed \
   --region "${REGION}" \
   --project "${PROJECT_ID}" \
   --allow-unauthenticated \
   --set-secrets="GEMINI_API_KEY=gemini-api-key:latest" \
   --set-env-vars="ENABLE_FIRESTORE=true,GCP_PROJECT_ID=${PROJECT_ID}" \
   --session-affinity \
   --timeout=3600 \
   --min-instances=1 \
   --max-instances=10 \
   --memory=512Mi \
   --cpu=1

echo "==> Done! Service URL:"
gcloud run services describe "${SERVICE_NAME}" \
   --region "${REGION}" \
   --project "${PROJECT_ID}" \
   --format="value(status.url)"
