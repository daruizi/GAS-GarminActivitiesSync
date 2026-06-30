#!/bin/bash
set -e

# 同步方向配置：global2cn（默认）或 cn2global
SYNC_DIRECTION="${SYNC_DIRECTION:-global2cn}"

# Cron 调度配置（默认每小时整点）
CRON_SCHEDULE="${CRON_SCHEDULE:-0 * * * *}"

# 构建同步命令
SYNC_CMD="cd /app && yarn sync:${SYNC_DIRECTION} >> /app/logs/cron.log 2>&1"

echo "====================================="
echo " Garmin 运动数据同步 - 定时任务模式"
echo "====================================="
echo " 同步方向: ${SYNC_DIRECTION}"
echo " 调度计划: ${CRON_SCHEDULE}"
echo " 时区:     ${TZ:-Asia/Shanghai}"
echo "====================================="

# 创建日志目录
mkdir -p /app/logs

# 如果设置了 RUN_ONCE=true，直接运行一次后退出
if [ "${RUN_ONCE}" = "true" ]; then
  echo "RUN_ONCE 模式，直接执行一次..."
  exec yarn sync:${SYNC_DIRECTION}
fi

# 创建 crontab
echo "${CRON_SCHEDULE} ${SYNC_CMD}" > /etc/crontabs/root

echo "Cron 任务已配置，等待执行..."
echo "下次执行时间: $(crontab -l)"

# 启动 cron 守护进程（前台运行）
exec crond -f -l 2
