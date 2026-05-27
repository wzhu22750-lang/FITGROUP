# PocketBase 服务器部署指南

## 一、下载 & 启动

在 VPS 上执行：

```bash
# 1. 下载 PocketBase (Linux amd64)
wget https://github.com/pocketbase/pocketbase/releases/download/v0.22.21/pocketbase_0.22.21_linux_amd64.zip
unzip pocketbase_0.22.21_linux_amd64.zip
chmod +x pocketbase

# 2. 启动 (默认监听 0.0.0.0:8090)
./pocketbase serve --http=0.0.0.0:8090
```

**如果是 ARM 服务器**（如树莓派、Apple Silicon Mac），替换为 `_linux_arm64.zip`。

## 二、创建 Collections

打开 `http://<服务器IP>:8090/_/` 进入 Admin UI，按提示创建管理员账号。然后创建以下 Collections：

### 1. users (PocketBase 内置，需自定义)

编辑内置 `users` collection，添加额外字段：

| 字段名 | 类型 | 说明 |
|--------|------|------|
| displayName | Plain text | 昵称 |
| photoURL | Url | 头像链接 |
| phone | Plain text | 手机号 |
| streak | Number | 连续打卡天数 |
| lastWorkoutDate | Date | 最近打卡日期 |
| totalWorkouts | Number | 累计打卡次数 |
| prs | JSON | 个人记录 {动作名: 重量} |

关闭 `email` 的邮箱验证要求：Settings → Disable email verification。

### 2. workoutLogs

| 字段名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| userId | Relation (→ users) | ✓ | 用户 ID |
| userName | Plain text | ✓ | 用户名 |
| userPhoto | Url | | 头像 |
| timestamp | Date | ✓ | 打卡时间 |
| category | Select (Shoulders/Chest/Back/Legs/Cardio/Others) | ✓ | 训练部位 |
| exercises | JSON | ✓ | [{id,name,type,weight?,sets?,reps?,duration?,distance?,calories?}] |
| photoUrl | Url | | 训练照片 |
| note | Plain text | | 笔记 |
| likesCount | Number | | 点赞数 |
| commentsCount | Number | | 评论数 |

### 3. likes

| 字段名 | 类型 | 必填 |
|--------|------|------|
| workoutLogId | Relation (→ workoutLogs) | ✓ |
| userId | Relation (→ users) | ✓ |

### 4. comments

| 字段名 | 类型 | 必填 |
|--------|------|------|
| workoutLogId | Relation (→ workoutLogs) | ✓ |
| userId | Relation (→ users) | ✓ |
| userName | Plain text | ✓ |
| userPhoto | Url | |
| content | Plain text | ✓ |

### 5. photos

| 字段名 | 类型 | 必填 |
|--------|------|------|
| file | File | ✓ |

## 三、安全设置

1. **API Rules**：在 Admin UI → Collections → 每个 collection → API Rules 中设置：

```
users:
  list: @request.auth.id != ''        (登录用户可查看)
  view: @request.auth.id != ''        (登录用户可查看)
  create:                            (允许注册)
  update: @request.auth.id = id      (仅本人可修改)
  delete: @request.auth.id = id      (仅本人可删除)

workoutLogs:
  list: @request.auth.id != ''
  view: @request.auth.id != ''
  create: @request.auth.id = @request.data.userId   (只能创建自己的)
  update: @request.auth.id = userId                   (只能修改自己的或点赞/评论计数)
  delete: @request.auth.id = userId

likes / comments:
  list: @request.auth.id != ''
  view: @request.auth.id != ''
  create: @request.auth.id != ''
  delete: @request.auth.id = userId

photos:
  list: @request.auth.id != ''
  view: @request.auth.id != ''
  create: @request.auth.id != ''
```

2. **关闭邮箱验证**：Admin UI → Collections → users → Options → 取消勾选 "Users must be verified"

## 四、生产环境 (可选)

使用 systemd 保持后台运行：

```bash
sudo tee /etc/systemd/system/pocketbase.service << 'EOF'
[Unit]
Description=PocketBase Service
After=network.target

[Service]
Type=simple
User=root
ExecStart=/root/pocketbase serve --http=0.0.0.0:8090
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable pocketbase
sudo systemctl start pocketbase
```

如果使用 Nginx 反代 + HTTPS：

```nginx
server {
    listen 443 ssl;
    server_name pb.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8090;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 五、前端配置

修改 `src/pocketbase.ts` 第 6 行的 `PB_URL`：
```ts
const PB_URL = 'https://pb.yourdomain.com'; // 或 http://VPS_IP:8090

## 六、防火墙

确保 VPS 开放 8090 端口：

```bash
# 云服务商安全组中放行 8090
# 或 iptables:
iptables -A INPUT -p tcp --dport 8090 -j ACCEPT
```
