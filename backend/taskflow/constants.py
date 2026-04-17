from datetime import timezone

UTC = timezone.utc

POSITIONS = ["策划", "美术", "前端程序", "后端程序", "测试"]
TICKET_TYPES = ["需求单", "BUG单"]
DEMAND_SUB_TYPES = ["策划需求", "程序需求", "美术需求", "测试需求"]
BUG_SUB_TYPES = ["BUG修复"]
TICKET_STATUS = ["待处理", "待验收", "待测试", "已完成"]
TICKET_FLOW_STAGES = ["execute", "accept", "test", "done"]
PRIORITIES = ["低", "中", "高", "紧急"]
