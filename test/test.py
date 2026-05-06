import urllib.request
import json 
data = urllib.request.urlopen('http://py4e-data.dr-chuck.net/comments_2386699.json').read().decode()
# print(data)
data = json.loads(data)
print(data)
d=0
for i in data['comments']:
    # print(i['count'])
    d+=i['count']
print(d)
