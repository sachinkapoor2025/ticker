#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-tickerplay-api-prod}"
APP_NAME="${AMPLIFY_APP_NAME:-tickerplay}"
BRANCH="${AMPLIFY_BRANCH:-main}"

echo "==> Installing contact API deps"
(cd "$ROOT/api/contact" && npm install --omit=dev)

echo "==> Building & deploying SAM stack: $STACK_NAME"
sam build -t "$ROOT/infra/template.yaml"

PARAM_OVERRIDES=(
  "EnvironmentName=prod"
  "AllowedOrigin=*"
)
# SAM rejects empty Parameter= values; only pass emails when set
if [ -n "${CONTACT_TO_EMAIL:-}" ]; then
  PARAM_OVERRIDES+=("ToEmail=${CONTACT_TO_EMAIL}")
fi
if [ -n "${CONTACT_FROM_EMAIL:-}" ]; then
  PARAM_OVERRIDES+=("FromEmail=${CONTACT_FROM_EMAIL}")
fi

sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --capabilities CAPABILITY_IAM \
  --resolve-s3 \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides "${PARAM_OVERRIDES[@]}"

CONTACT_ENDPOINT=$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='ContactEndpoint'].OutputValue" \
  --output text)

echo "Contact endpoint: $CONTACT_ENDPOINT"

echo "==> Creating Amplify app (if needed)"
EXISTING=$(aws amplify list-apps --region "$REGION" \
  --query "apps[?name=='$APP_NAME'].appId" --output text || true)

if [ -z "$EXISTING" ] || [ "$EXISTING" = "None" ]; then
  APP_JSON=$(aws amplify create-app \
    --name "$APP_NAME" \
    --platform WEB \
    --region "$REGION" \
    --output json)
  APP_ID=$(echo "$APP_JSON" | python3 -c "import sys,json; print(json.load(sys.stdin)['app']['appId'])")
  echo "Created Amplify app: $APP_ID"
else
  APP_ID="$EXISTING"
  echo "Using existing Amplify app: $APP_ID"
fi

# Ensure branch exists for manual deployments
BRANCH_EXISTS=$(aws amplify list-branches --app-id "$APP_ID" --region "$REGION" \
  --query "branches[?branchName=='$BRANCH'].branchName" --output text || true)
if [ -z "$BRANCH_EXISTS" ] || [ "$BRANCH_EXISTS" = "None" ]; then
  aws amplify create-branch \
    --app-id "$APP_ID" \
    --branch-name "$BRANCH" \
    --region "$REGION" \
    --enable-auto-build \
    >/dev/null
  echo "Created branch: $BRANCH"
fi

RULES=$(python3 - <<PY
import json
print(json.dumps([
  {"source": "/api/contact", "target": "$CONTACT_ENDPOINT", "status": "200"},
]))
PY
)

aws amplify update-app \
  --app-id "$APP_ID" \
  --region "$REGION" \
  --custom-rules "$RULES" \
  >/dev/null

echo "==> Packaging & deploying website to Amplify"
TMP=$(mktemp -d)
(cd "$ROOT/website" && zip -r "$TMP/website-deploy.zip" . -x "*.DS_Store")

JOB=$(aws amplify create-deployment \
  --app-id "$APP_ID" \
  --branch-name "$BRANCH" \
  --region "$REGION" \
  --output json)
JOB_ID=$(echo "$JOB" | python3 -c "import sys,json; print(json.load(sys.stdin)['jobId'])")
UPLOAD_URL=$(echo "$JOB" | python3 -c "import sys,json; print(json.load(sys.stdin)['zipUploadUrl'])")

curl -sS --fail -T "$TMP/website-deploy.zip" "$UPLOAD_URL"
aws amplify start-deployment \
  --app-id "$APP_ID" \
  --branch-name "$BRANCH" \
  --job-id "$JOB_ID" \
  --region "$REGION" \
  >/dev/null

echo "Waiting for Amplify job $JOB_ID..."
for i in $(seq 1 60); do
  STATUS=$(aws amplify get-job \
    --app-id "$APP_ID" \
    --branch-name "$BRANCH" \
    --job-id "$JOB_ID" \
    --region "$REGION" \
    --query 'job.summary.status' \
    --output text)
  echo "  status=$STATUS"
  case "$STATUS" in
    SUCCEED)
      DOMAIN=$(aws amplify get-app --app-id "$APP_ID" --region "$REGION" \
        --query 'app.defaultDomain' --output text)
      echo ""
      echo "============================================"
      echo "Deployed successfully"
      echo "Amplify App ID : $APP_ID"
      echo "Website URL    : https://$BRANCH.$DOMAIN"
      echo "Contact API    : $CONTACT_ENDPOINT"
      echo "============================================"
      echo "$APP_ID" > "$ROOT/.amplify-app-id"
      exit 0
      ;;
    FAILED|CANCELLED)
      echo "Amplify deployment failed"
      exit 1
      ;;
  esac
  sleep 15
done

echo "Timed out waiting for Amplify"
exit 1
