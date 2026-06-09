from flask import Flask, render_template, request, jsonify
import requests
import xml.etree.ElementTree as ET
import os

app = Flask(__name__)

SERVICE_KEY = os.environ.get('SERVICE_KEY', '5039af0d3b48f2540373d371810bec76d3ce3f1bdcd0c87532b348fa3d3c5f69')

API_URLS = {
    'apt_trade': 'https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade',
    'apt_rent':  'https://apis.data.go.kr/1613000/RTMSDataSvcAptRentV3/getRTMSDataSvcAptRentV3',
    'sh_trade':  'https://apis.data.go.kr/1613000/RTMSDataSvcSHTrade/getRTMSDataSvcSHTrade',
    'sh_rent':   'https://apis.data.go.kr/1613000/RTMSDataSvcSHRent/getRTMSDataSvcSHRent',
    'rh_trade':  'https://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade',
    'rh_rent':   'https://apis.data.go.kr/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent',
    'of_trade':  'https://apis.data.go.kr/1613000/RTMSDataSvcOffiTrade/getRTMSDataSvcOffiTrade',
    'of_rent':   'https://apis.data.go.kr/1613000/RTMSDataSvcOffiRent/getRTMSDataSvcOffiRent',
}


def parse_xml(text):
    root = ET.fromstring(text)
    result_code = root.findtext('.//resultCode') or root.findtext('.//header/resultCode') or '00'
    result_msg  = root.findtext('.//resultMsg')  or root.findtext('.//header/resultMsg')  or ''
    total_count = int(root.findtext('.//totalCount') or '0')
    items = []
    for item in root.findall('.//item'):
        d = {child.tag: (child.text or '').strip() for child in item}
        items.append(d)
    return {'resultCode': result_code, 'resultMsg': result_msg,
            'totalCount': total_count, 'items': items}


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/api/search')
def search():
    prop_type   = request.args.get('type', 'apt_trade')
    service_key = SERVICE_KEY
    lawd_cd     = request.args.get('lawdCd', '').strip()
    deal_ymd    = request.args.get('dealYmd', '').strip()

    if not lawd_cd:
        return jsonify({'error': '지역을 선택해주세요.'}), 400
    if len(deal_ymd) != 6:
        return jsonify({'error': '조회 년월이 올바르지 않습니다.'}), 400

    url = API_URLS.get(prop_type)
    if not url:
        return jsonify({'error': '잘못된 조회 유형입니다.'}), 400

    try:
        resp = requests.get(url, params={
            'serviceKey': service_key,
            'LAWD_CD':    lawd_cd,
            'DEAL_YMD':   deal_ymd,
            'numOfRows':  1000,
            'pageNo':     1,
        }, timeout=15)

        result = parse_xml(resp.text)
        code = result.get('resultCode', '00')

        if code not in ('00', '0', '000', '', None):
            return jsonify({'error': f"API 오류 [{code}]: {result.get('resultMsg')}"}), 400

        return jsonify(result)

    except requests.Timeout:
        return jsonify({'error': '요청 시간 초과. 다시 시도해주세요.'}), 504
    except ET.ParseError:
        return jsonify({'error': 'API 응답 파싱 실패. API 키가 올바른지 확인해주세요.'}), 502
    except Exception as e:
        return jsonify({'error': f'오류: {str(e)}'}), 500


if __name__ == '__main__':
    app.run(debug=True, port=5000)
