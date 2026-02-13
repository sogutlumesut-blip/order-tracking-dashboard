
#!/bin/bash
echo "🛑 Cleaning up old build artifacts..."
rm -rf .next
rm -rf node_modules/.cache

echo "🔄 Regenerating Database Client..."
npx prisma generate

echo "✅ Cleanup Complete!"
echo "👉 Now please run: npm run dev"
