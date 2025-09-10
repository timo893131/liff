from locust import HttpUser, task, between

class WebsiteUser(HttpUser):  # 確保類名正確
    wait_time = between(1, 5)  # 模擬用戶思考時間（1-5 秒）

    @task
    def access_prayer(self):
        self.client.get("/getPrayerData?hall=hall-h3-new")

# 無需額外包裹，類直接在頂級範圍