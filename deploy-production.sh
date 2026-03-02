#!/bin/bash
set -e
echo "🔨 Building element call..."
cd /root/online-beratung/ORISO-Complete/caritas-workspace/ORISO-ElementCall
npm run build

echo "🐳 Building Docker image..."
docker build -t element-call:latest .

echo "📦 Importing image into k3s..."
docker save element-call:latest | sudo k3s ctr images import - > /dev/null 2>&1

DEPLOYMENT_NAME="oriso-platform-element-call"
POD_SELECTOR="app=element-call"

echo "🚀 Restarting deployment..."
kubectl rollout restart deployment/${DEPLOYMENT_NAME} -n caritas
kubectl rollout status deployment/${DEPLOYMENT_NAME} -n caritas --timeout=120s

echo "✅ Element Call deployed successfully!"
kubectl get pods -n caritas -l ${POD_SELECTOR}

