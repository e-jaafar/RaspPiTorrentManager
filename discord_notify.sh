#!/bin/bash

# Load environment variables
source .env

# --- Functions ---

# Get CPU temperature
get_cpu_temp() {
    temp=$(cat /sys/class/thermal/thermal_zone0/temp)
    echo "CPU: $((temp/1000))°C"
}

# Get disk usage
get_disk_usage() {
    df -h /mnt/external_hdd | awk 'NR==2 {print "HDD: " $5 " used (" $3 "/" $2 ")"}'
}

# Get system uptime
get_uptime() {
    uptime -p | sed 's/up //'
}

# --- Main Logic ---

case "$1" in
    "allumé")
        if [ -f "$LOG_FILE" ]; then
            LAST_SHUTDOWN_TIME=$(cat "$LOG_FILE")
            CURRENT_TIME=$(date +%s)
            DOWNTIME_SEC=$((CURRENT_TIME - LAST_SHUTDOWN_TIME))
            DOWNTIME=$(printf "%02dh %02dm %02ds" $((DOWNTIME_SEC/3600)) $((DOWNTIME_SEC%3600/60)) $((DOWNTIME_SEC%60)))
        else
            DOWNTIME="Premier démarrage"
        fi

        # Generate Discord message
        MESSAGE=$(printf '🟢 **Raspberry Pi allumé**\n- Heure: %s\n- Temps d'\''arrêt: %s\n- %s\n- %s\n- %s\n- IP: %s' \
            "$(date '+%d/%m/%Y %H:%M:%S')" \
            "$DOWNTIME" \
            "$(get_uptime)" \
            "$(get_cpu_temp)" \
            "$(get_disk_usage)" \
            "$(hostname -I | awk '{print $1}')")

        # Send message to Discord
        curl -H "Content-Type: application/json" -X POST \
            -d "$(jq -n --arg msg "$MESSAGE" '{"content": $msg}')" \
            "$WEBHOOK_URL"
        ;;

    "éteint")
        date +%s > "$LOG_FILE"
        
        # Generate Discord message
        MESSAGE=$(printf '🔴 **Raspberry Pi éteint**\n- Heure: %s\n- Uptime précédent: %s\n- %s\n- %s' \
            "$(date '+%d/%m/%Y %H:%M:%S')" \
            "$(get_uptime)" \
            "$(get_cpu_temp)" \
            "$(get_disk_usage)")

        # Send message to Discord
        curl -H "Content-Type: application/json" -X POST \
            -d "$(jq -n --arg msg "$MESSAGE" '{"content": $msg}')" \
            "$WEBHOOK_URL"
        ;;
    "status")
        /home/user/system_status.sh status
        ;;
    "reboot")
        MESSAGE=$(printf '🔄 **Raspberry Pi redémarrage**\n- Heure: %s\n- Uptime: %s\n\nLe système va redémarrer dans 5 secondes...' \
            "$(date '+%d/%m/%Y %H:%M:%S')" \
            "$(get_uptime)")

        # Send message to Discord
        curl -H "Content-Type: application/json" -X POST \
            -d "$(jq -n --arg msg "$MESSAGE" '{"content": $msg}')" \
            "$WEBHOOK_URL"
        
        sleep 5
        sudo reboot
        ;;
esac