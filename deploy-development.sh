#!/bin/bash
set -e
echo "🔨 Building element call..."
cd /root/online-beratung/ORISO-Complete/caritas-workspace/ORISO-ElementCall
npm run build

echo "🐳 Building Docker image..."
TIMESTAMP=$(date +%s)
IMAGE_TAG="element-call:dev-${TIMESTAMP}"
docker build -t ${IMAGE_TAG} .
docker tag ${IMAGE_TAG} element-call:latest

echo "📦 Importing image into k3s..."
docker save ${IMAGE_TAG} | sudo k3s ctr images import - > /dev/null 2>&1
docker save element-call:latest | sudo k3s ctr images import - > /dev/null 2>&1

DEPLOYMENT_NAME="oriso-platform-element-call"
POD_SELECTOR="app=element-call"

echo "🚀 Restarting deployment..."
kubectl rollout restart deployment/${DEPLOYMENT_NAME} -n caritas
kubectl rollout status deployment/${DEPLOYMENT_NAME} -n caritas --timeout=120s

echo "✅ Element Call deployed successfully!"
echo "📋 Checking pod status..."
kubectl get pods -n caritas -l ${POD_SELECTOR}

echo "🔍 Verifying image details..."
kubectl get pod -n caritas -l ${POD_SELECTOR} -o jsonpath='{.items[0].spec.containers[0].image}{"\n"}'
kubectl get pod -n caritas -l ${POD_SELECTOR} -o jsonpath='{.items[0].status.containerStatuses[0].imageID}{"\n"}'

