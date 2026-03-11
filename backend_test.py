import requests
import sys
from datetime import datetime
import json

class UserAdminAPITester:
    def __init__(self, base_url="https://admin-dashboard-pro-37.preview.emergentagent.com"):
        self.base_url = base_url
        self.user_token = None
        self.admin_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_user_data = {
            "nom": f"Test User {datetime.now().strftime('%H%M%S')}",
            "email": f"testuser_{datetime.now().strftime('%H%M%S')}@example.com",
            "username": f"testuser_{datetime.now().strftime('%H%M%S')}",
            "password": "TestPassword123!"
        }
        self.created_user_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        if headers is None:
            headers = {'Content-Type': 'application/json'}

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)

            print(f"   Response Status: {response.status_code}")
            
            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    response_data = response.json()
                    print(f"   Response: {json.dumps(response_data, indent=2)[:200]}...")
                    return True, response_data
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"   Error: {response.text}")
                except:
                    pass
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_api_health(self):
        """Test API root endpoint"""
        return self.run_test("API Health Check", "GET", "", 200)

    def test_user_registration(self):
        """Test user registration"""
        success, response = self.run_test(
            "User Registration",
            "POST",
            "auth/register",
            200,
            data=self.test_user_data
        )
        return success

    def test_user_login_pending(self):
        """Test user login (should be pending)"""
        success, response = self.run_test(
            "User Login (Should be pending)",
            "POST",
            "auth/login",
            403,  # Should return 403 for pending users
            data={
                "email": self.test_user_data["email"],
                "password": self.test_user_data["password"]
            }
        )
        return success

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/admin-login",
            200,
            data={"password": "admin123"}
        )
        if success and 'token' in response:
            self.admin_token = response['token']
            print(f"   Admin token obtained: {self.admin_token[:20]}...")
        return success

    def test_get_users_admin(self):
        """Test getting users list as admin"""
        if not self.admin_token:
            print("❌ Admin token not available, skipping test")
            return False
            
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.admin_token}'
        }
        success, response = self.run_test(
            "Get Users (Admin)",
            "GET",
            "admin/users?filter=all",
            200,
            headers=headers
        )
        
        if success and response:
            # Find our test user
            for user in response:
                if user.get('email') == self.test_user_data['email']:
                    self.created_user_id = user.get('telegram_id')
                    print(f"   Found test user with ID: {self.created_user_id}")
                    break
        
        return success

    def test_activate_user(self):
        """Test activating a user"""
        if not self.admin_token or not self.created_user_id:
            print("❌ Admin token or user ID not available, skipping test")
            return False
            
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.admin_token}'
        }
        success, response = self.run_test(
            f"Activate User (ID: {self.created_user_id})",
            "PATCH",
            f"admin/users/{self.created_user_id}/activate",
            200,
            headers=headers
        )
        return success

    def test_user_login_after_activation(self):
        """Test user login after activation"""
        success, response = self.run_test(
            "User Login (After Activation)",
            "POST",
            "auth/login",
            200,
            data={
                "email": self.test_user_data["email"],
                "password": self.test_user_data["password"]
            }
        )
        if success and 'token' in response:
            self.user_token = response['token']
            print(f"   User token obtained: {self.user_token[:20]}...")
        return success

    def test_get_current_user(self):
        """Test getting current user profile"""
        if not self.user_token:
            print("❌ User token not available, skipping test")
            return False
            
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.user_token}'
        }
        success, response = self.run_test(
            "Get Current User Profile",
            "GET",
            "users/me",
            200,
            headers=headers
        )
        return success

    def test_update_user_profile(self):
        """Test updating user profile"""
        if not self.user_token:
            print("❌ User token not available, skipping test")
            return False
            
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.user_token}'
        }
        
        update_data = {
            "username": f"updated_{self.test_user_data['username']}",
            "couleur_principale": "#FF0000"
        }
        
        success, response = self.run_test(
            "Update User Profile",
            "PATCH",
            "users/me",
            200,
            data=update_data,
            headers=headers
        )
        return success

    def test_deactivate_user(self):
        """Test deactivating a user"""
        if not self.admin_token or not self.created_user_id:
            print("❌ Admin token or user ID not available, skipping test")
            return False
            
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.admin_token}'
        }
        success, response = self.run_test(
            f"Deactivate User (ID: {self.created_user_id})",
            "PATCH",
            f"admin/users/{self.created_user_id}/deactivate",
            200,
            headers=headers
        )
        return success

    def test_invalid_login(self):
        """Test login with invalid credentials"""
        success, response = self.run_test(
            "Invalid Login Test",
            "POST",
            "auth/login",
            401,
            data={
                "email": "invalid@example.com",
                "password": "wrongpassword"
            }
        )
        return success

    def test_invalid_admin_login(self):
        """Test admin login with invalid password"""
        success, response = self.run_test(
            "Invalid Admin Login Test",
            "POST",
            "auth/admin-login",
            401,
            data={"password": "wrongadminpassword"}
        )
        return success

def main():
    print("🚀 Starting User Administration API Tests")
    print("=" * 60)
    
    tester = UserAdminAPITester()
    
    # Test sequence
    test_results = []
    
    # Basic API health
    test_results.append(("API Health", tester.test_api_health()))
    
    # User registration and authentication flow
    test_results.append(("User Registration", tester.test_user_registration()))
    test_results.append(("User Login (Pending)", tester.test_user_login_pending()))
    
    # Admin authentication and user management
    test_results.append(("Admin Login", tester.test_admin_login()))
    test_results.append(("Get Users List", tester.test_get_users_admin()))
    test_results.append(("Activate User", tester.test_activate_user()))
    
    # User authentication after activation
    test_results.append(("User Login (Active)", tester.test_user_login_after_activation()))
    test_results.append(("Get User Profile", tester.test_get_current_user()))
    test_results.append(("Update Profile", tester.test_update_user_profile()))
    
    # Admin user management
    test_results.append(("Deactivate User", tester.test_deactivate_user()))
    
    # Error case testing
    test_results.append(("Invalid Login", tester.test_invalid_login()))
    test_results.append(("Invalid Admin Login", tester.test_invalid_admin_login()))
    
    # Print results summary
    print("\n" + "=" * 60)
    print("📊 TEST RESULTS SUMMARY")
    print("=" * 60)
    
    for test_name, passed in test_results:
        status = "✅ PASSED" if passed else "❌ FAILED"
        print(f"{test_name:<25} {status}")
    
    print(f"\nOverall: {tester.tests_passed}/{tester.tests_run} tests passed")
    
    # Return exit code
    return 0 if tester.tests_passed == tester.tests_run else 1

if __name__ == "__main__":
    sys.exit(main())