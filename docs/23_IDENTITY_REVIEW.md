# Identity Review

تبويب مراجعة الهوية يعرض الإشارات غير المحسومة ومرشحيها ودرجة الثقة. القرارات المتاحة: تأكيد شخص موجود، إنشاء شخص جديد، أو تأجيل القرار.

## API
- `POST /identity/resolve`
- `GET /identity/review-queue`
- `POST /identity/review`
- `POST /identity/merge`
- `POST /identity/merge/undo`

## قاعدة الحوكمة
لا يعتمد النظام دمجًا غامضًا لمجرد تطابق الاسم الأول. القرارات اليدوية والدمج والتراجع مسجلة وقابلة للمراجعة.
